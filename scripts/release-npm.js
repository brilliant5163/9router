#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_REGISTRY = "https://npm.darkred.vip:8888/";
const DEFAULT_NPM_CACHE = path.join(os.tmpdir(), "9routerx-npm-cache");

function parseArgs(argv) {
  const options = {
    registry: process.env.NPM_REGISTRY || DEFAULT_REGISTRY,
    tag: process.env.NPM_TAG || "latest",
    dryRun: false,
    skipBuild: false,
    otp: process.env.NPM_CONFIG_OTP || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-build") options.skipBuild = true;
    else if (arg === "--registry") options.registry = argv[++i];
    else if (arg.startsWith("--registry=")) options.registry = arg.slice("--registry=".length);
    else if (arg === "--tag") options.tag = argv[++i];
    else if (arg.startsWith("--tag=")) options.tag = arg.slice("--tag=".length);
    else if (arg === "--otp") options.otp = argv[++i];
    else if (arg.startsWith("--otp=")) options.otp = arg.slice("--otp=".length);
    else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.registry) throw new Error("Registry is required");
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function npmEnv(extra = {}) {
  return {
    ...process.env,
    npm_config_cache: process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE || DEFAULT_NPM_CACHE,
    ...extra,
  };
}

function main() {
  const root = path.resolve(__dirname, "..");
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const options = parseArgs(process.argv.slice(2));

  if (pkg.private) {
    throw new Error(`${pkg.name}@${pkg.version} is marked private and cannot be published`);
  }

  console.log(`[release] package: ${pkg.name}@${pkg.version}`);
  console.log(`[release] registry: ${options.registry}`);

  if (!options.skipBuild) {
    run("npm", ["run", "build"], {
      cwd: root,
      env: npmEnv({
        DATA_DIR: process.env.DATA_DIR || path.join(os.tmpdir(), "9routerx-release-build-data"),
        NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || "1",
      }),
    });
  }

  const publishArgs = [
    "publish",
    "--registry",
    options.registry,
    "--tag",
    options.tag,
    "--access",
    "public",
  ];

  if (options.dryRun) publishArgs.push("--dry-run");
  if (options.otp) publishArgs.push("--otp", options.otp);

  run("npm", publishArgs, { cwd: root, env: npmEnv() });
}

try {
  main();
} catch (error) {
  console.error(`[release] ${error.message}`);
  process.exit(1);
}
