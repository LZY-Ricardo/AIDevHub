import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function buildLatestManifest({
  version,
  notes,
  pubDate,
  platform,
  signature,
  url,
}) {
  if (!signature?.trim()) {
    throw new Error("Signature cannot be empty");
  }
  if (Number.isNaN(Date.parse(pubDate))) {
    throw new Error("pubDate must be a valid date string");
  }
  if (!platform) {
    throw new Error("platform is required");
  }
  if (!url) {
    throw new Error("url is required");
  }

  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      [platform]: {
        signature,
        url,
      },
    },
  };
}

export function generateLatestJson({
  outputPath,
  version,
  notes,
  pubDate,
  platform,
  signatureFilePath,
  url,
}) {
  const signature = readFileSync(signatureFilePath, "utf8").trim();
  const manifest = buildLatestManifest({
    version,
    notes,
    pubDate,
    platform,
    signature,
    url,
  });

  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

const cliEntry = process.argv[1] ? `file://${process.argv[1].replace(/\\/g, "/")}` : null;

if (cliEntry && import.meta.url === cliEntry) {
  const [
    ,
    ,
    outputPath,
    version,
    notes,
    pubDate,
    platform,
    signatureFilePath,
    url,
  ] = process.argv;

  if (!outputPath || !version || !notes || !pubDate || !platform || !signatureFilePath || !url) {
    throw new Error(
      "Usage: node generate-latest-json.mjs <outputPath> <version> <notes> <pubDate> <platform> <signatureFilePath> <url>",
    );
  }

  generateLatestJson({
    outputPath: resolve(outputPath),
    version,
    notes,
    pubDate,
    platform,
    signatureFilePath: resolve(signatureFilePath),
    url,
  });
}
