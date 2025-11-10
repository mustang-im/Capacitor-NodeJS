import path from "node:path";
import https from "https";
import { cp } from "fs/promises";
import fs from "node:fs";
import AdmZip from "adm-zip";
import { PluginsConfig } from "@capacitor/cli";
import { packageDir, getConfigPath, readConfig } from "./util";

const platform = process.env.CAPACITOR_PLATFORM_NAME ?? "web";
const iosDefaultLib = 'https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-ios.zip';
const androidDefaultLib = 'https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip';

const forceDownloadNodeJS = process.env.FORCE_DOWNLOAD_NODEJS;
let libDir: string = platform == 'android' ? androidDefaultLib : iosDefaultLib;

/**
 * Sets the correct lib path for the platform and
 * fetches the lib if source is an `https://` url
 */
export async function setupLib(libDir: string, platform: string) {
  // Check if we need to re-download based on config
  // If libDir is a URL and different from what's cached, force download
  let shouldForceDownload = false;
  if (libDir?.startsWith("https://")) {
    try {
      const configPath = await getConfigPath();
      if (configPath) {
        let config: PluginsConfig["CapacitorNodeJS"] = await readConfig(configPath);
        const configLibDir = config?.[`${platform}LibNode`];
        // If config specifies a different URL than what's cached, force download
        if (configLibDir && configLibDir !== libDir && await hasNodeJS(platform)) {
          shouldForceDownload = true;
          console.log(`Config specifies different Node.js version (${configLibDir}), forcing re-download...`);
        }
      }
    } catch (ex) {
      // If we can't read config, continue with normal flow
      console.log(`Could not read config to check for version mismatch: ${ex}`);
    }
  }

  if (!forceDownloadNodeJS && !shouldForceDownload && await hasNodeJS(platform)) {
    console.log(`Node.js library already exists at ${path.join(packageDir, platform, 'libnode')}, skipping download.`);
    console.log(`To force re-download, set FORCE_DOWNLOAD_NODEJS=1 environment variable.`);
    return;
  }

  if (!libDir?.startsWith("https://")) {
    await copyNodeJS();
    return;
  }

  let url = libDir;
  libDir = path.join(packageDir, platform, 'libnode');

  console.log(`Downloading Node.js from ${url}...`);
  let zipPath = await downloadNodeJS(url);
  console.log('Download finished!');

  console.log('Extracting Node.js...');
  await extractAsset(zipPath, libDir);
  console.log('Extraction finished!');
}

async function downloadNodeJS(url: string, retries = 5): Promise<string> {
  return await new Promise(async (resolve, reject) => {
    try {
      if (!url) {
        reject(new Error("ERROR: Missing lib URL"));
      }
      if (retries == 0) {
        reject(new Error('ERROR: Too many retries while fetching Node.js...'));
      }
      https.get(url, {headers: {'User-Agent': 'node.js'}}, async (fileRes) => {
        fileRes.on("error", (ex) => {
          reject(ex);
        });
        if (fileRes.statusCode == 302) {
          resolve(await downloadNodeJS(fileRes.headers.location as string, retries -= 1));
        }
        const tmpPath = path.join(packageDir, "nodejs.zip");
        const fileStream = fs.createWriteStream(tmpPath);
        fileRes.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(fileStream.path as string);
        });
      });
    } catch (ex) {
      reject(ex);
    }
  });
}

async function extractAsset(zipPath: string, destinationPath: string) {
  // Preserve .gitkeep file if it exists
  const gitkeepPath = path.join(destinationPath, '.gitkeep');
  const gitkeepExists = fs.existsSync(gitkeepPath);

  let zip = new AdmZip(zipPath);
  zip.extractAllTo(destinationPath, true);
  fs.unlinkSync(zipPath);

  // Restore .gitkeep file if it existed before extraction
  if (gitkeepExists && !fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '');
  } else if (!fs.existsSync(gitkeepPath)) {
    // Ensure .gitkeep exists even if it didn't before (for git tracking)
    fs.writeFileSync(gitkeepPath, '');
  }
}

async function hasNodeJS(platform: string) {
  if (platform == 'android') {
    return fs.existsSync(path.join(packageDir, 'android/libnode/bin'));
  } else if (platform == 'ios') {
    return fs.existsSync(path.join(packageDir, 'ios', 'libnode'));
  }
  return false;
}

async function copyNodeJS() {
  let destDir = path.join(packageDir, platform, 'libnode');
  await cp(libDir, destDir, {recursive: true});
  libDir = destDir;
}

async function main() {
  try {
    if (platform == "web") return;

    let path = await getConfigPath();
    if (!path) {
      throw new Error("ERROR: Capacitor config not found");
    }

    let config: PluginsConfig["CapacitorNodeJS"] = await readConfig(path);
    libDir = config?.[`${platform}LibNode`] ?? libDir;

    // Fix: setupLib expects (libDir, platform) not (platform, libDir)
    await setupLib(libDir, platform);

  } catch (ex) {
    console.error(ex);
    process.exit(1);
  }
}

main();