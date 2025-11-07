import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore - loadConfig is not exported in types but exists in the package
import { loadConfig } from '@capacitor/cli/dist/config.js';

// Patches a package.json in case it has variable substitution for
// the module's binary at runtime. Since we are cross-compiling
// for mobile, this substitution will have different values at
// build time and runtime, so we pre-substitute them with fixed
// values.
function patchPackageJSON_preNodeGyp_modulePath(filePath: string) {
  let packageReadData = fs.readFileSync(filePath, 'utf8');
  let packageJSON = JSON.parse(packageReadData);
  if ( packageJSON && packageJSON.binary && packageJSON.binary.module_path ) {
    let binaryPathConfiguration = packageJSON.binary.module_path;
    binaryPathConfiguration = binaryPathConfiguration.replace(/\{node_abi\}/g, "node_abi");
    binaryPathConfiguration = binaryPathConfiguration.replace(/\{platform\}/g, "platform");
    binaryPathConfiguration = binaryPathConfiguration.replace(/\{arch\}/g, "arch");
    binaryPathConfiguration = binaryPathConfiguration.replace(/\{target_arch\}/g, "target_arch");
    binaryPathConfiguration = binaryPathConfiguration.replace(/\{libc\}/g, "libc");
    packageJSON.binary.module_path = binaryPathConfiguration;
    let packageWriteData = JSON.stringify(packageJSON, null, 2);
    fs.writeFileSync(filePath, packageWriteData);
  }
}

// Visits every package.json to apply patches.
function visitPackageJSON(folderPath: string) {
  let files = fs.readdirSync(folderPath);
  for (var i in files) {
    let name = files[i];
    let filePath = path.join(folderPath, files[i]);
    if(fs.statSync(filePath).isDirectory()) {
      visitPackageJSON(filePath);
    } else {
      if (name === 'package.json') {
        try {
          patchPackageJSON_preNodeGyp_modulePath(filePath);
        } catch (e) {
          console.warn(
            'Failed to patch the file : "' +
            filePath +
            '". The following error was thrown: ' +
            JSON.stringify(e)
          );
        }
      }
    }
  }
}

// Gets the platform's www path using Capacitor config.
async function getPlatformWWWPath(platform: string, config: any): Promise<string> {
  if (platform === 'android') {
    const androidConfig = config.android;
    if (androidConfig?.webDirAbs) {
      return androidConfig.webDirAbs;
    }
    // Fallback to standard Capacitor Android structure
    return path.join(config.app.rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');
  } else if (platform === 'ios') {
    const iosConfig = config.ios;
    if (iosConfig?.webDirAbs) {
      // webDirAbs is a lazy getter, so we need to await it
      return await iosConfig.webDirAbs;
    }
    // Fallback to standard Capacitor iOS structure
    return path.join(config.app.rootDir, 'ios', 'App', 'App', 'public');
  }
  
  // Fallback to webDir from config
  return config.app.webDirAbs;
}

// Applies the patch to the selected platform
async function patchTargetPlatform(platform: string) {
  const config = await loadConfig();
  const wwwPath = await getPlatformWWWPath(platform, config);
  
  // Get the nodeDir from plugin config (defaults to "nodejs")
  const pluginConfig = config.app.extConfig.plugins?.CapacitorNodeJS;
  const nodeDir = pluginConfig?.nodeDir || 'nodejs';
  
  const nodeModulesPathToPatch = path.join(wwwPath, nodeDir, 'node_modules');
  if (fs.existsSync(nodeModulesPathToPatch)) {
    visitPackageJSON(nodeModulesPathToPatch);
  }
}

export default async function() {
  // Get platforms from environment variable or process all
  const platformEnv = process.env.CAPACITOR_PLATFORM_NAME;
  
  if (platformEnv === 'android' || !platformEnv) {
    await patchTargetPlatform('android');
  }
  
  if (platformEnv === 'ios' || !platformEnv) {
    await patchTargetPlatform('ios');
  }
}
