import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

describe("tailscale binary lookup", () => {
  it("does not run the Windows nul redirect from Unix shell fallback", () => {
    const source = fs.readFileSync(path.join(ROOT_DIR, "src/lib/tunnel/tailscale.js"), "utf8");

    expect(source).not.toContain("which tailscale 2>/dev/null || where tailscale 2>nul");
    expect(source).toContain('IS_WINDOWS ? "where tailscale 2>nul" : "command -v tailscale 2>/dev/null"');
  });
});
