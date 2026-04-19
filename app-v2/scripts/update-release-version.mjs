import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function replaceJsonVersion(filePath, nextVersion) {
  const source = readFileSync(filePath, "utf8");
  const json = JSON.parse(source);
  json.version = nextVersion;
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}

function replaceCargoTomlVersion(filePath, nextVersion) {
  const source = readFileSync(filePath, "utf8");
  const updated = source.replace(/^version = ".*"$/m, `version = "${nextVersion}"`);
  writeFileSync(filePath, updated, "utf8");
}

function replaceCargoLockVersion(filePath, nextVersion) {
  const source = readFileSync(filePath, "utf8");
  const updated = source.replace(
    /(name = "app-v2"\r?\nversion = ")([^"]+)(")/,
    `$1${nextVersion}$3`,
  );
  writeFileSync(filePath, updated, "utf8");
}

export function updateReleaseVersion(projectRoot, nextVersion) {
  replaceJsonVersion(resolve(projectRoot, "package.json"), nextVersion);
  replaceCargoTomlVersion(resolve(projectRoot, "src-tauri/Cargo.toml"), nextVersion);
  replaceJsonVersion(resolve(projectRoot, "src-tauri/tauri.conf.json"), nextVersion);
  replaceCargoLockVersion(resolve(projectRoot, "src-tauri/Cargo.lock"), nextVersion);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const projectRoot = process.argv[2];
  const nextVersion = process.argv[3];

  if (!projectRoot || !nextVersion) {
    throw new Error("Usage: node update-release-version.mjs <projectRoot> <version>");
  }

  updateReleaseVersion(projectRoot, nextVersion);
}
