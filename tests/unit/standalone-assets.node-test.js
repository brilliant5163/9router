import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ensureStandaloneRuntime } from "../../lib/cli/standaloneRuntime.js";

describe("ensureStandaloneRuntime", () => {
  test("copies Next static and public assets beside standalone server", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "9router-standalone-assets-"));

    try {
      mkdirSync(path.join(rootDir, ".next", "static", "chunks"), { recursive: true });
      mkdirSync(path.join(rootDir, ".next", "standalone", ".next"), { recursive: true });
      mkdirSync(path.join(rootDir, "public", "providers"), { recursive: true });
      writeFileSync(path.join(rootDir, ".next", "static", "chunks", "app.js"), "chunk");
      writeFileSync(path.join(rootDir, "public", "providers", "codex.png"), "image");

      ensureStandaloneRuntime(rootDir);

      assert.equal(
        readFileSync(
          path.join(rootDir, ".next", "standalone", ".next", "static", "chunks", "app.js"),
          "utf8",
        ),
        "chunk",
      );
      assert.equal(
        readFileSync(path.join(rootDir, ".next", "standalone", "public", "providers", "codex.png"), "utf8"),
        "image",
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
