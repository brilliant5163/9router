import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function loadCommonJs(relativePath, requireStub = () => ({}), extraContext = {}) {
  const filename = path.join(ROOT_DIR, relativePath);
  const cjsModule = { exports: {} };
  const context = {
    module: cjsModule,
    exports: cjsModule.exports,
    require: requireStub,
    console,
    process,
    ...extraContext,
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return cjsModule.exports;
}

function loadRootCAWithCertStub(mitmDir) {
  return loadCommonJs("src/mitm/cert/rootCA.js", (id) => {
    if (id === "path") return path;
    if (id === "fs") return fs;
    if (id === "node-forge") {
      return {
        pki: {
          certificateFromPem: (pem) => {
            const cert = JSON.parse(pem);
            cert.validity.notAfter = new Date(cert.validity.notAfter);
            return cert;
          },
        },
      };
    }
    if (id === "../paths") return { MITM_DIR: mitmDir };
    if (id === "../../shared/constants/brand.cjs") {
      return {
        BRAND: {
          mitmRootCACommonName: "9RouterX MITM Root CA",
          mitmRootCAOrganization: "9RouterX",
        },
      };
    }
    throw new Error(`Unexpected require: ${id}`);
  });
}

function writeRootCertFixture(certPath, commonName, organizationName) {
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 10);
  const attrs = [
    { name: "commonName", value: commonName },
    { name: "organizationName", value: organizationName },
    { name: "countryName", value: "US" },
  ];
  fs.writeFileSync(certPath, JSON.stringify({
    validity: { notAfter: notAfter.toISOString() },
    subject: { attributes: attrs },
    issuer: { attributes: attrs },
  }));
}

describe("9RouterX runtime branding", () => {
  it("keeps the CommonJS runtime brand on 9routerx", () => {
    const { BRAND } = loadCommonJs("src/shared/constants/brand.cjs");
    expect(BRAND.displayName).toBe("9RouterX");
    expect(BRAND.npmPackageName).toBe("9routerx");
    expect(BRAND.defaultDataDirName).toBe("9routerx");
    expect(BRAND.mitmRootCACommonName).toBe("9RouterX MITM Root CA");
  });

  it("uses 9routerx as the default MITM data directory", () => {
    const pathModule = loadCommonJs("src/mitm/paths.js", (id) => {
      if (id === "path") return path;
      if (id === "os") return { homedir: () => "/home/tester" };
      if (id === "../shared/constants/brand.cjs") {
        return { BRAND: { defaultDataDirName: "9routerx" } };
      }
      throw new Error(`Unexpected require: ${id}`);
    }, {
      process: { ...process, env: {}, platform: "linux" },
    });

    expect(pathModule.DATA_DIR).toBe("/home/tester/.9routerx");
    expect(pathModule.MITM_DIR).toBe("/home/tester/.9routerx/mitm");
  });

  it("publishes a 9routerx CLI binary", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
    expect(pkg.name).toBe("9routerx");
    expect(pkg.private).toBe(false);
    expect(pkg.bin).toEqual({ "9routerx": "./bin/cli.js" });
    expect(fs.readFileSync(path.join(ROOT_DIR, "bin/cli.js"), "utf8")).toMatch(/^#!\/usr\/bin\/env node/);
  });

  it("regenerates a still-valid MITM root CA when the old 9Router brand is present", () => {
    const mitmDir = fs.mkdtempSync(path.join(os.tmpdir(), "9routerx-brand-test-"));
    const { ROOT_CA_CERT_PATH, isCertExpired } = loadRootCAWithCertStub(mitmDir);
    writeRootCertFixture(ROOT_CA_CERT_PATH, "9Router MITM Root CA", "9Router");

    expect(isCertExpired(ROOT_CA_CERT_PATH)).toBe(true);
  });

  it("keeps a still-valid MITM root CA when the 9RouterX subject and issuer match", () => {
    const mitmDir = fs.mkdtempSync(path.join(os.tmpdir(), "9routerx-brand-test-"));
    const { ROOT_CA_CERT_PATH, isCertExpired } = loadRootCAWithCertStub(mitmDir);
    writeRootCertFixture(ROOT_CA_CERT_PATH, "9RouterX MITM Root CA", "9RouterX");

    expect(isCertExpired(ROOT_CA_CERT_PATH)).toBe(false);
  });
});
