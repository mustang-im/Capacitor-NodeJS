import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore - loadConfig is not exported in types but exists in the package
import { loadConfig } from '@capacitor/cli/dist/config.js';

var fileList: string[] = [];
var dirList: string[] = [];

function enumFolder(folderPath: string) {
  var files = fs.readdirSync(folderPath);
  for (var i in files) {
    var name = files[i];
    var filePath = folderPath + '/' + files[i];
    if (fs.statSync(filePath).isDirectory()) {
      if (name.startsWith('.') === false) {
        dirList.push(filePath);
        enumFolder(filePath);
      }
    } else {
      if (name.startsWith('.') === false &&
          name.endsWith('.gz') === false &&
          name.endsWith('~') === false) {
        fileList.push(filePath);
      }
    }
  }
}

// Gets the Android assets path using Capacitor config.
async function getAndroidAssetsPath(): Promise<string> {
  const config = await loadConfig();
  const androidConfig = config.android;
  if (androidConfig?.webDirAbs) {
    // The Android application's assets path will be the parent of the application's www folder.
    return path.join(androidConfig.webDirAbs, '..');
  }
  // Fallback to standard Capacitor Android structure
  return path.join(config.app.rootDir, 'android', 'app', 'src', 'main', 'assets');
}

async function createFileAndFolderLists() {
  try {
    const config = await loadConfig();
    const androidAssetsPath = await getAndroidAssetsPath();
    
    // Get the nodeDir from plugin config (defaults to "nodejs")
    const pluginConfig = config.app.extConfig.plugins?.CapacitorNodeJS;
    const nodeDir = pluginConfig?.nodeDir || 'nodejs';
    
    // The nodejs project is in the public folder (which is the webDir)
    const androidConfig = config.android;
    const wwwPath = androidConfig?.webDirAbs || path.join(config.app.rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');
    const nodeJsProjectRoot = path.join(wwwPath, nodeDir);
    
    // Ensure the directory exists
    if (!fs.existsSync(nodeJsProjectRoot)) {
      return;
    }
    
    var fileListPath = path.join(androidAssetsPath, 'file.list');
    var dirListPath = path.join(androidAssetsPath, 'dir.list');

    // Reset lists
    fileList = [];
    dirList = [];
    
    // Calculate relative paths from the nodeJsProjectRoot
    enumFolder(nodeJsProjectRoot);
    
    // Convert absolute paths to relative paths
    const relativeFileList = fileList.map(filePath => path.relative(nodeJsProjectRoot, filePath));
    const relativeDirList = dirList.map(dirPath => path.relative(nodeJsProjectRoot, dirPath));
    
    fs.writeFileSync(fileListPath, relativeFileList.join('\n'));
    fs.writeFileSync(dirListPath, relativeDirList.join('\n'));
  } catch (err) {
    console.log(err);
    throw err;
  }
}

async function main() {
  // Only run for Android platform
  const platformEnv = process.env.CAPACITOR_PLATFORM_NAME;
  if (platformEnv === 'android' || !platformEnv) {
    await createFileAndFolderLists();
  }
}

main();
