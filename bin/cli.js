#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { ensureStandaloneAssets } = require("./standaloneAssets");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_PORT = "20128";
const DEFAULT_HOST = "0.0.0.0";
const BRAND_NAME = "9RouterX";
const APP_DATA_DIR_NAME = "9routerx";

function getDefaultDataDir() {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      APP_DATA_DIR_NAME,
    );
  }
  return path.join(os.homedir(), `.${APP_DATA_DIR_NAME}`);
}

function getRuntimePaths(dataDir) {
  return {
    dataDir,
    pidFile: path.join(dataDir, "server.pid"),
    metaFile: path.join(dataDir, "server.json"),
    logFile: path.join(dataDir, "server.log"),
  };
}

function readPackage() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  } catch {
    return { version: "unknown" };
  }
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    command: "start",
    host: env.HOSTNAME || DEFAULT_HOST,
    port: env.PORT || DEFAULT_PORT,
    dataDir: env.DATA_DIR || getDefaultDataDir(),
    foreground: false,
    open: true,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (["start", "status", "stop", "restart", "open", "logs"].includes(arg)) {
      options.command = arg;
    } else if (arg === "--host" || arg === "-H") {
      options.host = argv[index + 1] || options.host;
      index += 1;
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length) || options.host;
    } else if (arg === "--port" || arg === "-p") {
      options.port = argv[index + 1] || options.port;
      index += 1;
    } else if (arg.startsWith("--port=")) {
      options.port = arg.slice("--port=".length) || options.port;
    } else if (arg === "--data-dir") {
      options.dataDir = argv[index + 1] || options.dataDir;
      index += 1;
    } else if (arg.startsWith("--data-dir=")) {
      options.dataDir = arg.slice("--data-dir=".length) || options.dataDir;
    } else if (arg === "--foreground" || arg === "--log" || arg === "-l") {
      options.foreground = true;
    } else if (arg === "--no-open" || arg === "--no-browser" || arg === "-n") {
      options.open = false;
    } else if (arg === "--open") {
      options.open = true;
    } else if (arg === "--skip-update" || arg === "--tray") {
      // Compatibility flags consumed by packaged launchers/updaters.
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function formatHelp() {
  return `${BRAND_NAME} ${readPackage().version}

Usage:
  9routerx [command] [options]

Commands:
  start               Start server in background (default)
  status              Show background server status
  stop                Stop background server
  restart             Restart background server
  open                Open dashboard in browser
  logs                Print log file path

Options:
  -p, --port <port>   Port to listen on (default: ${DEFAULT_PORT})
  -H, --host <host>   Hostname to bind (default: ${DEFAULT_HOST})
  --data-dir <path>   Runtime data directory (default: ${getDefaultDataDir()})
  -n, --no-open       Do not open the dashboard in a browser
  --no-browser        Alias for --no-open
  -l, --log           Run in foreground and show server logs
  --foreground        Run in foreground
  --skip-update       Accepted for updater relaunch compatibility
  --tray              Accepted for tray launcher compatibility
  -h, --help          Show this help
  -v, --version       Show version
`;
}

function ensureDataDir(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  ensureDataDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readPid(pidFile) {
  try {
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writePid(pidFile, pid) {
  ensureDataDir(path.dirname(pidFile));
  fs.writeFileSync(pidFile, `${pid}\n`);
}

function removeRuntimeFiles(paths) {
  fs.rmSync(paths.pidFile, { force: true });
  fs.rmSync(paths.metaFile, { force: true });
}

function isProcessRunning(pid) {
  if (!pid) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function openDashboard(url) {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

function printStatus(paths) {
  const pid = readPid(paths.pidFile);
  const meta = readJson(paths.metaFile);

  if (isProcessRunning(pid)) {
    console.log(`${BRAND_NAME} is running`);
    console.log(`PID: ${pid}`);
    console.log(`URL: ${meta?.baseUrl || `http://localhost:${DEFAULT_PORT}`}`);
    console.log(`Log: ${paths.logFile}`);
    return true;
  }

  removeRuntimeFiles(paths);
  console.log(`${BRAND_NAME} is not running`);
  return false;
}

function stopServer(paths) {
  const pid = readPid(paths.pidFile);

  if (!isProcessRunning(pid)) {
    removeRuntimeFiles(paths);
    console.log(`${BRAND_NAME} is not running`);
    return false;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    removeRuntimeFiles(paths);
    console.log(`${BRAND_NAME} is not running`);
    return false;
  }

  removeRuntimeFiles(paths);
  console.log(`${BRAND_NAME} stopped`);
  return true;
}

function resolveNextBin() {
  try {
    return require.resolve("next/dist/bin/next", { paths: [ROOT_DIR] });
  } catch {
    return null;
  }
}

function resolveServerCommand() {
  const rootServer = path.join(ROOT_DIR, "server.js");
  if (fs.existsSync(rootServer)) {
    return { cmd: process.execPath, args: [rootServer], cwd: ROOT_DIR, dev: false };
  }

  const standaloneServer = path.join(ROOT_DIR, ".next", "standalone", "server.js");
  if (fs.existsSync(standaloneServer)) {
    ensureStandaloneAssets(ROOT_DIR);
    return { cmd: process.execPath, args: [standaloneServer], cwd: ROOT_DIR, dev: false };
  }

  const nextBin = resolveNextBin();
  if (!nextBin) {
    throw new Error("Next.js runtime is missing. Run npm install before starting 9routerx.");
  }

  const hasBuild = fs.existsSync(path.join(ROOT_DIR, ".next", "BUILD_ID"));
  if (hasBuild) {
    return { cmd: process.execPath, args: [nextBin, "start"], cwd: ROOT_DIR, dev: false };
  }

  return { cmd: process.execPath, args: [nextBin, "dev", "--webpack"], cwd: ROOT_DIR, dev: true };
}

function resolveMitmServerPath() {
  const sourceServer = path.join(ROOT_DIR, "src", "mitm", "server.js");
  if (fs.existsSync(sourceServer)) return sourceServer;

  const standaloneServer = path.join(ROOT_DIR, ".next", "standalone", "src", "mitm", "server.js");
  if (fs.existsSync(standaloneServer)) return standaloneServer;

  return "";
}

function checkPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      resolve(true);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(Number(port), host);
  });
}

function createLogFileDescriptors(paths) {
  ensureDataDir(paths.dataDir);
  fs.appendFileSync(paths.logFile, `\n[${new Date().toISOString()}] Starting ${BRAND_NAME}\n`);
  const out = fs.openSync(paths.logFile, "a");
  const err = fs.openSync(paths.logFile, "a");
  return ["ignore", out, err];
}

function closeLogFileDescriptors(stdio) {
  if (!Array.isArray(stdio)) return;

  for (const fd of stdio.slice(1)) {
    try {
      fs.closeSync(fd);
    } catch {}
  }
}

function getPortConflictMessage(port) {
  return [
    `Port ${port} is already in use by an existing ${BRAND_NAME} instance.`,
    `Use 9routerx --port <new-port> to run on a different port.`,
  ].join("\n");
}

async function runCli(argv = process.argv.slice(2), env = process.env) {
  let options;
  try {
    options = parseArgs(argv, env);
  } catch (error) {
    console.error(error.message);
    console.log(formatHelp());
    return 1;
  }

  if (options.help) {
    console.log(formatHelp());
    return 0;
  }

  if (options.version) {
    console.log(readPackage().version);
    return 0;
  }

  const paths = getRuntimePaths(path.resolve(options.dataDir));

  if (options.command === "status") {
    return printStatus(paths) ? 0 : 1;
  }

  if (options.command === "stop") {
    stopServer(paths);
    return 0;
  }

  if (options.command === "logs") {
    console.log(paths.logFile);
    return 0;
  }

  const meta = readJson(paths.metaFile);
  if (options.command === "open") {
    const url = meta?.dashboardUrl || `${meta?.baseUrl || `http://localhost:${DEFAULT_PORT}`}/dashboard`;
    openDashboard(url);
    console.log(`Opened ${url}`);
    return 0;
  }

  if (options.command === "restart") {
    stopServer(paths);
  }

  const port = String(options.port);
  const host = options.host || DEFAULT_HOST;
  const baseUrl = env.NEXT_PUBLIC_BASE_URL || `http://localhost:${port}`;
  const dashboardUrl = `${baseUrl}/dashboard`;
  const runningPid = readPid(paths.pidFile);

  if (isProcessRunning(runningPid) && options.command !== "restart") {
    const runningMeta = readJson(paths.metaFile);
    console.log(`${BRAND_NAME} is already running on ${runningMeta?.baseUrl || baseUrl}`);
    console.log(`PID: ${runningPid}`);
    return 0;
  }

  const available = await checkPortAvailable(port, host);
  if (!available) {
    console.error(getPortConflictMessage(port));
    return 1;
  }

  let command;
  try {
    command = resolveServerCommand();
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  console.log(`${BRAND_NAME} dashboard: ${dashboardUrl}`);
  console.log(`Data directory: ${paths.dataDir}`);

  const foreground = options.foreground;
  const stdio = foreground ? "inherit" : createLogFileDescriptors(paths);
  const childEnv = {
    ...env,
    HOSTNAME: host,
    PORT: port,
    NODE_ENV: command.dev ? "development" : "production",
    DATA_DIR: paths.dataDir,
    NEXT_PUBLIC_BASE_URL: baseUrl,
  };
  const mitmServerPath = resolveMitmServerPath();
  if (mitmServerPath) childEnv.MITM_SERVER_PATH = mitmServerPath;

  const child = spawn(command.cmd, command.args, {
    cwd: command.cwd,
    env: childEnv,
    detached: !foreground,
    stdio,
    windowsHide: false,
  });

  child.on("error", (error) => {
    console.error(`Failed to start ${BRAND_NAME}: ${error.message}`);
    closeLogFileDescriptors(stdio);
    process.exit(1);
  });

  if (!foreground) {
    writePid(paths.pidFile, child.pid);
    writeJson(paths.metaFile, {
      pid: child.pid,
      port,
      host,
      baseUrl,
      dashboardUrl,
      dataDir: paths.dataDir,
      logFile: paths.logFile,
      startedAt: new Date().toISOString(),
    });
    child.unref();
    closeLogFileDescriptors(stdio);
    if (options.open) openDashboard(dashboardUrl);
    console.log(`${BRAND_NAME} is running in background on ${baseUrl}`);
    console.log(`Dashboard: ${dashboardUrl}`);
    console.log(`Log: ${paths.logFile}`);
    return 0;
  }

  process.on("SIGINT", () => {
    if (child.exitCode == null) child.kill("SIGINT");
  });
  process.on("SIGTERM", () => {
    if (child.exitCode == null) child.kill("SIGTERM");
  });

  return new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 0);
    });
  });
}

if (require.main === module) {
  runCli().then((code) => {
    process.exit(code);
  });
}

module.exports = {
  parseArgs,
  getDefaultDataDir,
  getRuntimePaths,
  formatHelp,
  getPortConflictMessage,
  isProcessRunning,
  printStatus,
  stopServer,
  resolveServerCommand,
  runCli,
};
