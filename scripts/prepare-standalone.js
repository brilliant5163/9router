const fs = require("node:fs");
const path = require("node:path");

function shouldCopyFile(source, target) {
  if (!fs.existsSync(target)) return true;
  const sourceStat = fs.statSync(source);
  const targetStat = fs.statSync(target);
  return sourceStat.size !== targetStat.size || sourceStat.mtimeMs > targetStat.mtimeMs;
}

function copyRecursive(source, target) {
  if (!fs.existsSync(source)) return;

  const sourceStat = fs.statSync(source);
  if (sourceStat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }

  if (shouldCopyFile(source, target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function prepareStandalone(rootDir = process.cwd()) {
  const standaloneDir = path.join(rootDir, ".next", "standalone");
  if (!fs.existsSync(standaloneDir)) return false;

  copyRecursive(
    path.join(rootDir, ".next", "static"),
    path.join(standaloneDir, ".next", "static"),
  );
  copyRecursive(path.join(rootDir, "public"), path.join(standaloneDir, "public"));
  return true;
}

if (require.main === module) {
  prepareStandalone();
}

module.exports = { prepareStandalone };