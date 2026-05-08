const fs = require("node:fs");
const path = require("node:path");

function copyMissingRecursive(source, target) {
  if (!fs.existsSync(source)) return;

  const sourceStat = fs.statSync(source);
  if (sourceStat.isDirectory()) {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    for (const entry of fs.readdirSync(source)) {
      copyMissingRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }

  if (!fs.existsSync(target)) {
    fs.copyFileSync(source, target);
  }
}

function ensureStandaloneRuntime(rootDir) {
  const standaloneDir = path.join(rootDir, ".next", "standalone");
  if (!fs.existsSync(standaloneDir)) return;

  copyMissingRecursive(
    path.join(rootDir, ".next", "static"),
    path.join(standaloneDir, ".next", "static"),
  );
  copyMissingRecursive(path.join(rootDir, "public"), path.join(standaloneDir, "public"));
  copyMissingRecursive(path.join(rootDir, "src", "mitm"), path.join(standaloneDir, "src", "mitm"));
}

module.exports = { ensureStandaloneRuntime };
