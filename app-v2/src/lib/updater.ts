import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateProgress {
  downloaded: number;
  total: number | undefined;
}

export async function checkForUpdate() {
  return check();
}

export async function downloadAndInstallUpdate(
  onProgress?: (progress: UpdateProgress) => void,
) {
  const update = await check();
  if (!update) {
    throw new Error("No update available");
  }

  let downloaded = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength;
        downloaded = 0;
        onProgress?.({ downloaded, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
        break;
      case "Finished":
        break;
    }
  });
}

export async function relaunchApp() {
  await relaunch();
}
