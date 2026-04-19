import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLatestManifest } from "../scripts/generate-latest-json.mjs";
import { updateReleaseVersion } from "../scripts/update-release-version.mjs";

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
