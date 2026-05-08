const path = require("path");
const os = require("os");
const { BRAND } = require("../shared/constants/brand.cjs");

// Single source of truth for data directory — matches localDb.js logic
function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), BRAND.defaultDataDirName);
  }
  return path.join(os.homedir(), `.${BRAND.defaultDataDirName}`);
}

const DATA_DIR = getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");

module.exports = { DATA_DIR, MITM_DIR };
