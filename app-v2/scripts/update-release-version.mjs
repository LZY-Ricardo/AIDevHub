import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function buildJsonVersionContent(filePath, nextVersion) {
  const source = readFileSync(filePath, "utf8");
  const json = JSON.parse(source);
  json.version = nextVersion;
  return `${JSON.stringify(json, null, 2)}\n`;
}

function buildCargoTomlVersionContent(filePath, nextVersion) {
  const source = readFileSync(filePath, "utf8");
  const updated = source.replace(
    /(\[package\][^\[]*?)^version = ".*"$/m,
    `$1version = "${nextVersion}"`,
  );
  if (updated === source) {
    throw new Error(`Failed to update Cargo.toml version in ${filePath}`);
  }
  return updated;
}

function buildCargoLockVersionContent(filePath, nextVersion) {
  const source = readFileSync(filePath, "utf8");
  const updated = source.replace(
    /(name = "app-v2"\r?\nversion = ")([^"]+)(")/,
    `$1${nextVersion}$3`,
  );
  if (updated === source) {
    throw new Error(`Failed to update Cargo.lock version in ${filePath}`);
  }
  return updated;
}

export function updateReleaseVersion(projectRoot, nextVersion) {
  const packageJsonPath = resolve(projectRoot, "package.json");
  const cargoTomlPath = resolve(projectRoot, "src-tauri/Cargo.toml");
  const tauriConfigPath = resolve(projectRoot, "src-tauri/tauri.conf.json");
  const cargoLockPath = resolve(projectRoot, "src-tauri/Cargo.lock");

  const nextPackageJson = buildJsonVersionContent(packageJsonPath, nextVersion);
  const nextCargoToml = buildCargoTomlVersionContent(cargoTomlPath, nextVersion);
  const nextTauriConfig = buildJsonVersionContent(tauriConfigPath, nextVersion);
  const nextCargoLock = buildCargoLockVersionContent(cargoLockPath, nextVersion);

  writeFileSync(packageJsonPath, nextPackageJson, "utf8");
  writeFileSync(cargoTomlPath, nextCargoToml, "utf8");
  writeFileSync(tauriConfigPath, nextTauriConfig, "utf8");
  writeFileSync(cargoLockPath, nextCargoLock, "utf8");
}

export function readReleaseVersions(projectRoot) {
  const packageJson = JSON.parse(
    readFileSync(resolve(projectRoot, "package.json"), "utf8"),
  );
  const tauriConfig = JSON.parse(
    readFileSync(resolve(projectRoot, "src-tauri/tauri.conf.json"), "utf8"),
  );
  const cargoToml = readFileSync(resolve(projectRoot, "src-tauri/Cargo.toml"), "utf8");
  const cargoLock = readFileSync(resolve(projectRoot, "src-tauri/Cargo.lock"), "utf8");

  const cargoVersionMatch = cargoToml.match(/^version = "([^"]+)"$/m);
  if (!cargoVersionMatch) {
    throw new Error("Failed to read Cargo.toml version");
  }
  const cargoLockVersionMatch = cargoLock.match(
    /(name = "app-v2"\r?\nversion = ")([^"]+)(")/,
  );
  if (!cargoLockVersionMatch) {
    throw new Error("Failed to read Cargo.lock version");
  }

  return {
    packageJson: packageJson.version,
    cargoToml: cargoVersionMatch[1],
    cargoLock: cargoLockVersionMatch[2],
    tauriConfig: tauriConfig.version,
  };
}

const cliEntry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (cliEntry && import.meta.url === cliEntry) {
  const projectRoot = process.argv[2];
  const nextVersion = process.argv[3];

  if (!projectRoot || !nextVersion) {
    throw new Error("Usage: node update-release-version.mjs <projectRoot> <version>");
  }

  updateReleaseVersion(projectRoot, nextVersion);
}
