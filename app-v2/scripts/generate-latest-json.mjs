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

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
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
