import { describe, it, expect } from "vitest";

import cli from "../../bin/cli.js";

const { normalizePort, parseArgs } = cli;

describe("CLI argument parsing", () => {
  it("uses HOST instead of shell HOSTNAME for bind host", () => {
    expect(parseArgs([], { HOSTNAME: "workstation", HOST: "127.0.0.1" }).host).toBe("127.0.0.1");
    expect(parseArgs([], { HOSTNAME: "workstation" }).host).toBe("0.0.0.0");
  });

  it("normalizes valid ports", () => {
    expect(normalizePort("20128")).toBe("20128");
  });

  it("rejects invalid ports", () => {
    expect(() => normalizePort("abc")).toThrow("Invalid port: abc");
    expect(() => normalizePort("0")).toThrow("Invalid port: 0");
    expect(() => normalizePort("65536")).toThrow("Invalid port: 65536");
  });
});
