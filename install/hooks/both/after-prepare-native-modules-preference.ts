import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore - loadConfig is not exported in types but exists in the package
import { loadConfig } from '@capacitor/cli/dist/config.js';

// Gets the platform's www path using Capacitor config.
async function getPlatformWWWPath(platform: string): Promise<string> {
  const config = await loadConfig();
  const rootDir = config.app.rootDir;
  
  if (platform === 'android') {
    // For Android, the www folder is typically at android/app/src/main/assets/public
    // But we check the actual config structure
    const androidConfig = config.android;
    if (androidConfig?.webDirAbs) {
      return androidConfig.webDirAbs;
    }
    // Fallback to standard Capacitor Android structure
    return path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');
  } else if (platform === 'ios') {
    // For iOS, the www folder is typically at ios/App/App/public
    const iosConfig = config.ios;
    if (iosConfig?.webDirAbs) {
      // webDirAbs is a lazy getter, so we need to await it
      return await iosConfig.webDirAbs;
    }
    // Fallback to standard Capacitor iOS structure
    return path.join(rootDir, 'ios', 'App', 'App', 'public');
  }
  
  // Fallback to webDir from config
  return config.app.webDirAbs;
}

// Adds a file to save the contents of the NODEJS_MOBILE_BUILD_NATIVE_MODULES
// environment variable if it is set during the prepare step.
async function saveBuildNativeModulesPreference(platform: string) {
  const wwwPath = await getPlatformWWWPath(platform);
  const saveBuildNativeModulesPreferencePath = path.join(wwwPath, 'NODEJS_MOBILE_BUILD_NATIVE_MODULES_VALUE.txt');
  
  if (process.env.NODEJS_MOBILE_BUILD_NATIVE_MODULES !== undefined) {
    // Ensure the directory exists
    const dir = path.dirname(saveBuildNativeModulesPreferencePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(saveBuildNativeModulesPreferencePath, process.env.NODEJS_MOBILE_BUILD_NATIVE_MODULES);
  }
}

export default async function() {
  // Get platforms from environment variable or process all
  const platformEnv = process.env.CAPACITOR_PLATFORM_NAME;
  
  if (platformEnv === 'android' || !platformEnv) {
    await saveBuildNativeModulesPreference('android');
  }
  
  if (platformEnv === 'ios' || !platformEnv) {
    await saveBuildNativeModulesPreference('ios');
  }
}
