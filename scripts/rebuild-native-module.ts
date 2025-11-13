/**
 * Rebuilds Node.js native modules for Android/iOS using nodejs-mobile-gyp
 * Follows the same pattern as prebuild-for-nodejs-mobile
 * 
 * Usage: rebuild-native-module.js <module-path> <target>
 * 
 * Arguments:
 *   module-path: Path to the native module directory
 *   target: Target platform/arch (e.g., android-arm64, android-arm, android-x64)
 * 
 * Environment variables (set by Gradle):
 *   NODE_GYP: Path to nodejs-mobile-gyp
 *   NODE_DIR: Path to nodejs-mobile libnode directory
 *   NDK_HOME: Android NDK home directory
 *   TARGET_API: Android API level
 *   GYP_DEFINES: GYP defines string
 *   CC, CXX, AR, LINK: Compiler paths
 *   PATH: Modified PATH with compiler wrappers
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

interface PackageJSON {
  scripts?: {
    install?: string;
    rebuild?: string;
  };
  gypfile?: boolean;
}

/**
 * Get package.json from module directory
 */
function getPackageJSON(modulePath: string): PackageJSON | null {
  const pkgPath = join(modulePath, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Check if module is a GYP-based native addon
 */
function isGypNodeAddon(modulePath: string): boolean {
  const bindingGyp = join(modulePath, 'binding.gyp');
  if (!existsSync(bindingGyp)) return false;
  
  const pkgJSON = getPackageJSON(modulePath);
  if (!pkgJSON) return false;
  
  return !!(pkgJSON.scripts?.install || pkgJSON.scripts?.rebuild || pkgJSON.gypfile);
}

/**
 * Patch package.json to use nodejs-mobile-gyp
 * Similar to prebuild-for-nodejs-mobile's approach
 */
function patchPackageJSON(modulePath: string, nodeGypPath: string): boolean {
  const pkgPath = join(modulePath, 'package.json');
  if (!existsSync(pkgPath)) return false;
  
  const pkgJSON = getPackageJSON(modulePath);
  if (!pkgJSON) return false;
  
  // Check if already patched
  if (pkgJSON.scripts?.install?.includes('nodejs-mobile-gyp')) {
    return false;
  }
  
  // Backup original
  const backupPath = pkgPath + '.bak';
  if (!existsSync(backupPath)) {
    copyFileSync(pkgPath, backupPath);
  }
  
  // Patch scripts to use nodejs-mobile-gyp
  if (!pkgJSON.scripts) {
    pkgJSON.scripts = {};
  }
  
  // Replace node-gyp with nodejs-mobile-gyp in install/rebuild scripts
  if (pkgJSON.scripts.install) {
    pkgJSON.scripts.install = pkgJSON.scripts.install.replace(/node-gyp/g, nodeGypPath);
  }
  if (pkgJSON.scripts.rebuild) {
    pkgJSON.scripts.rebuild = pkgJSON.scripts.rebuild.replace(/node-gyp/g, nodeGypPath);
  }
  
  writeFileSync(pkgPath, JSON.stringify(pkgJSON, null, 2) + '\n', 'utf8');
  return true;
}

/**
 * Undo package.json patch
 */
function undoPackageJSONPatch(modulePath: string): void {
  const pkgPath = join(modulePath, 'package.json');
  const backupPath = pkgPath + '.bak';
  
  if (existsSync(backupPath)) {
    unlinkSync(pkgPath);
    copyFileSync(backupPath, pkgPath);
    unlinkSync(backupPath);
  }
}

/**
 * Build GYP module using nodejs-mobile-gyp
 */
function buildGypModule(modulePath: string, nodeGypPath: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const task = spawn('node', [nodeGypPath, 'rebuild', '--release'], {
      cwd: modulePath,
      env: env,
      stdio: 'inherit'
    });
    
    task.on('close', (code) => {
      resolve(code ?? 0);
    });
    
    task.on('error', (err) => {
      console.error(`Error building module: ${err.message}`);
      resolve(1);
    });
  });
}

/**
 * Main function
 */
async function main() {
  const modulePath = process.argv[2];
  const target = process.argv[3];
  
  if (!modulePath || !target) {
    console.error('Usage: rebuild-native-module.js <module-path> <target>');
    console.error('Example: rebuild-native-module.js ./node_modules/better-sqlite3 android-arm64');
    process.exit(1);
  }
  
  const resolvedModulePath = resolve(modulePath);
  
  if (!existsSync(resolvedModulePath)) {
    console.error(`Error: Module path does not exist: ${resolvedModulePath}`);
    process.exit(1);
  }
  
  if (!isGypNodeAddon(resolvedModulePath)) {
    console.error('Error: Not a GYP-based native module');
    process.exit(1);
  }
  
  const nodeGypPath = process.env.NODE_GYP;
  if (!nodeGypPath || !existsSync(nodeGypPath)) {
    console.error('Error: NODE_GYP environment variable not set or invalid');
    process.exit(1);
  }
  
  // Patch package.json before building
  const packageJSONPatched = patchPackageJSON(resolvedModulePath, nodeGypPath);
  
  if (packageJSONPatched) {
    console.log('Patched package.json');
  }
  
  // Build the module
  const buildEnv = {
    ...process.env,
    // Ensure nodejs-mobile-gyp is used
    NODE_GYP: nodeGypPath,
    npm_config_node_gyp: nodeGypPath,
  };
  
  const code = await buildGypModule(resolvedModulePath, nodeGypPath, buildEnv);
  
  // Undo patches after building (regardless of success/failure)
  if (packageJSONPatched) {
    undoPackageJSONPatch(resolvedModulePath);
  }
  
  process.exit(code);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

