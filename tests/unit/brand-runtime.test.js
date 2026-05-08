import { describe, expect, it } from "vitest";
import fs from "node:fs";
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
});
