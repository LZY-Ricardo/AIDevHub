import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLatestManifest } from "../scripts/generate-latest-json.mjs";
import {
  readReleaseVersions,
  updateReleaseVersion,
} from "../scripts/update-release-version.mjs";

const workflowSource = readFileSync(
  new URL("../../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

test("generate latest manifest uses platform keyed signature and url", () => {
  const manifest = buildLatestManifest({
    version: "0.4.2",
    notes: "Release notes",
    pubDate: "2026-04-19T10:00:00Z",
    platform: "windows-x86_64",
    signature: "sig-content",
    url: "https://example.com/app.zip",
  });

  assert.equal(manifest.version, "0.4.2");
  assert.equal(manifest.platforms["windows-x86_64"].signature, "sig-content");
  assert.equal(manifest.platforms["windows-x86_64"].url, "https://example.com/app.zip");
});

test("generate latest manifest rejects empty signature and invalid pubDate", () => {
  assert.throws(
    () =>
      buildLatestManifest({
        version: "0.4.2",
        notes: "Release notes",
        pubDate: "invalid-date",
        platform: "windows-x86_64",
        signature: "",
        url: "https://example.com/app.zip",
      }),
    /Signature cannot be empty/,
  );

  assert.throws(
    () =>
      buildLatestManifest({
        version: "0.4.2",
        notes: "Release notes",
        pubDate: "invalid-date",
        platform: "windows-x86_64",
        signature: "sig-content",
        url: "https://example.com/app.zip",
      }),
    /pubDate must be a valid date string/,
  );
});

test("updateReleaseVersion updates package, cargo and tauri config versions", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "aidevhub-release-"));
  const srcTauri = join(tempRoot, "src-tauri");
  mkdirSync(srcTauri, { recursive: true });

  writeFileSync(
    join(tempRoot, "package.json"),
    JSON.stringify({ version: "0.4.1" }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(srcTauri, "Cargo.toml"),
    '[package]\nname = "app-v2"\nversion = "0.4.1"\n',
    "utf8",
  );
  writeFileSync(
    join(srcTauri, "tauri.conf.json"),
    JSON.stringify({ version: "0.4.1" }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(srcTauri, "Cargo.lock"),
    '[[package]]\nname = "app-v2"\nversion = "0.4.1"\n',
    "utf8",
  );

  updateReleaseVersion(tempRoot, "0.4.2");

  assert.match(readFileSync(join(tempRoot, "package.json"), "utf8"), /"version": "0.4.2"/);
  assert.match(readFileSync(join(srcTauri, "Cargo.toml"), "utf8"), /version = "0.4.2"/);
  assert.match(readFileSync(join(srcTauri, "tauri.conf.json"), "utf8"), /"version": "0.4.2"/);
  assert.match(readFileSync(join(srcTauri, "Cargo.lock"), "utf8"), /version = "0.4.2"/);
});

test("readReleaseVersions returns package, cargo and tauri versions", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "aidevhub-release-read-"));
  const srcTauri = join(tempRoot, "src-tauri");
  mkdirSync(srcTauri, { recursive: true });

  writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ version: "0.4.5" }, null, 2), "utf8");
  writeFileSync(join(srcTauri, "Cargo.toml"), '[package]\nversion = "0.4.5"\n', "utf8");
  writeFileSync(join(srcTauri, "tauri.conf.json"), JSON.stringify({ version: "0.4.5" }, null, 2), "utf8");
  writeFileSync(join(srcTauri, "Cargo.lock"), '[[package]]\nname = "app-v2"\nversion = "0.4.5"\n', "utf8");

  const versions = readReleaseVersions(tempRoot);

  assert.deepEqual(versions, {
    packageJson: "0.4.5",
    cargoToml: "0.4.5",
    cargoLock: "0.4.5",
    tauriConfig: "0.4.5",
  });
});

test("updateReleaseVersion throws when Cargo.toml replacement does not happen", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "aidevhub-release-fail-"));
  const srcTauri = join(tempRoot, "src-tauri");
  mkdirSync(srcTauri, { recursive: true });

  const packageJsonPath = join(tempRoot, "package.json");
  const cargoTomlPath = join(srcTauri, "Cargo.toml");
  const tauriConfigPath = join(srcTauri, "tauri.conf.json");
  const cargoLockPath = join(srcTauri, "Cargo.lock");

  writeFileSync(packageJsonPath, JSON.stringify({ version: "0.4.1" }, null, 2), "utf8");
  writeFileSync(join(srcTauri, "Cargo.toml"), '[package]\nname = "app-v2"\n', "utf8");
  writeFileSync(tauriConfigPath, JSON.stringify({ version: "0.4.1" }, null, 2), "utf8");
  writeFileSync(cargoLockPath, '[[package]]\nname = "app-v2"\nversion = "0.4.1"\n', "utf8");

  assert.throws(() => updateReleaseVersion(tempRoot, "0.4.2"), /Failed to update Cargo\.toml version/);
  assert.match(readFileSync(packageJsonPath, "utf8"), /"version": "0.4.1"/);
  assert.match(readFileSync(tauriConfigPath, "utf8"), /"version": "0.4.1"/);
  assert.match(readFileSync(cargoLockPath, "utf8"), /version = "0.4.1"/);
});

test("updateReleaseVersion throws when Cargo.lock replacement does not happen", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "aidevhub-release-lock-fail-"));
  const srcTauri = join(tempRoot, "src-tauri");
  mkdirSync(srcTauri, { recursive: true });

  const packageJsonPath = join(tempRoot, "package.json");
  const cargoTomlPath = join(srcTauri, "Cargo.toml");
  const tauriConfigPath = join(srcTauri, "tauri.conf.json");
  const cargoLockPath = join(srcTauri, "Cargo.lock");

  writeFileSync(packageJsonPath, JSON.stringify({ version: "0.4.1" }, null, 2), "utf8");
  writeFileSync(cargoTomlPath, '[package]\nname = "app-v2"\nversion = "0.4.1"\n', "utf8");
  writeFileSync(tauriConfigPath, JSON.stringify({ version: "0.4.1" }, null, 2), "utf8");
  writeFileSync(cargoLockPath, '[[package]]\nname = "other-crate"\nversion = "0.4.1"\n', "utf8");

  assert.throws(() => updateReleaseVersion(tempRoot, "0.4.2"), /Failed to update Cargo\.lock version/);
  assert.match(readFileSync(packageJsonPath, "utf8"), /"version": "0.4.1"/);
  assert.match(readFileSync(cargoTomlPath, "utf8"), /version = "0.4.1"/);
  assert.match(readFileSync(tauriConfigPath, "utf8"), /"version": "0.4.1"/);
});

test("readReleaseVersions can be imported from node -e without process argv entry", () => {
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      "import { readReleaseVersions } from './scripts/update-release-version.mjs'; console.log(typeof readReleaseVersions);",
    ],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  ).trim();

  assert.equal(output, "function");
});

test("release workflow requires main branch and avoids mutating main before release", () => {
  assert.match(workflowSource, /Release Automation 只能从 main 手动触发/);
  assert.match(workflowSource, /Fail if release tag already exists/);
  assert.match(workflowSource, /检测到已存在的 tag/);
  assert.match(workflowSource, /检测到已存在的 release/);
  assert.match(workflowSource, /RELEASE_NOTES/);
  assert.match(workflowSource, /git show-ref --verify --quiet/);
  assert.match(workflowSource, /gh api "repos\/\$\{\{ github\.repository \}\}\/releases\/tags\/\$tag"/);
  assert.match(workflowSource, /检查 release 状态失败/);
  assert.doesNotMatch(workflowSource, /git push origin HEAD:main/);
  assert.doesNotMatch(workflowSource, /git tag -f/);
});

test("release workflow validates bundle artifacts and fails fast on existing tag or release", () => {
  assert.match(workflowSource, /Validate bundle artifacts/);
  assert.match(workflowSource, /缺少发布产物/);
  assert.match(workflowSource, /发布产物为空文件/);
  assert.match(workflowSource, /签名文件为空/);
  assert.match(workflowSource, /Fail if release tag already exists/);
  assert.match(workflowSource, /Validate latest\.json/);
  assert.match(workflowSource, /latest\.json notes 不能为空/);
  assert.match(workflowSource, /latest\.json pub_date 不合法/);
  assert.match(workflowSource, /latest\.json 缺少 windows-x86_64 平台配置/);
  assert.match(workflowSource, /signature 不匹配/);
  assert.match(workflowSource, /url 不匹配/);
  assert.match(workflowSource, /Cleanup failed release/);
  assert.match(workflowSource, /gh release delete/);
  assert.match(workflowSource, /git push origin ":refs\/tags\/\$tag"/);
});
