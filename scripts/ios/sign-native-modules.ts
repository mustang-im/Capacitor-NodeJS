/**
 * Sign native Node.js modules for iOS
 * This script creates frameworks from .node files, embeds them, and signs them
 */

import { existsSync, readFileSync, unlinkSync, statSync, readdirSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

const NODE_DIR = process.env.NODE_DIR || 'nodejs';
const CODESIGNING_FOLDER_PATH = process.env.CODESIGNING_FOLDER_PATH || '';
const PLUGIN_SCRIPTS_PATH = process.env.PLUGIN_SCRIPTS_PATH || '';
const TARGET_BUILD_DIR = process.env.TARGET_BUILD_DIR || '';
const FRAMEWORKS_FOLDER_PATH = process.env.FRAMEWORKS_FOLDER_PATH || '';
const EXPANDED_CODE_SIGN_IDENTITY = process.env.EXPANDED_CODE_SIGN_IDENTITY || '';
const PROJECT_DIR = process.env.PROJECT_DIR || '';

// Determine nodejs directory
let NODEJS_DIR = join(CODESIGNING_FOLDER_PATH, 'public', NODE_DIR);
if (!existsSync(NODEJS_DIR)) {
  NODEJS_DIR = join(CODESIGNING_FOLDER_PATH, NODE_DIR);
}

// Check if build native modules preference is set
let NODEJS_MOBILE_BUILD_NATIVE_MODULES = process.env.NODEJS_MOBILE_BUILD_NATIVE_MODULES;

if (!NODEJS_MOBILE_BUILD_NATIVE_MODULES) {
  const preferenceFilePath = join(NODEJS_DIR, 'NODEJS_MOBILE_BUILD_NATIVE_MODULES_VALUE.txt');
  if (existsSync(preferenceFilePath)) {
    NODEJS_MOBILE_BUILD_NATIVE_MODULES = readFileSync(preferenceFilePath, 'utf8').trim();
    unlinkSync(preferenceFilePath);
  }
}

// Check if node directory exists
if (!existsSync(NODEJS_DIR)) {
  console.log(`Warning: node directory not found at ${NODEJS_DIR}, skipping code signing`);
  process.exit(0);
}

// Determine if native modules should be built
if (!NODEJS_MOBILE_BUILD_NATIVE_MODULES) {
  let organizedDirs: string[] = [];
  
  // Check build/Release
  const buildReleasePath = join(NODEJS_DIR, 'build', 'Release');
  if (existsSync(buildReleasePath)) {
    try {
      const entries = readdirSync(buildReleasePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('.node')) {
          organizedDirs.push(join(buildReleasePath, entry.name));
        }
      }
    } catch {
      // Ignore
    }
  }
  
  // Check prebuilds
  const prebuildsPath = join(NODEJS_DIR, 'prebuilds');
  if (existsSync(prebuildsPath)) {
    try {
      const entries = readdirSync(prebuildsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const platformPath = join(prebuildsPath, entry.name);
          try {
            const nodeEntries = readdirSync(platformPath, { withFileTypes: true });
            for (const nodeEntry of nodeEntries) {
              if (nodeEntry.isDirectory() && nodeEntry.name.endsWith('.node')) {
                organizedDirs.push(join(platformPath, nodeEntry.name));
              }
            }
          } catch {
            // Ignore
          }
        }
      }
    } catch {
      // Ignore
    }
  }
  
  // Check node_modules/prebuilds
  const nodeModulesPath = join(NODEJS_DIR, 'node_modules');
  if (existsSync(nodeModulesPath)) {
    try {
      const modules = readdirSync(nodeModulesPath, { withFileTypes: true });
      for (const module of modules) {
        if (module.isDirectory()) {
          const prebuildsPath = join(nodeModulesPath, module.name, 'prebuilds');
          if (existsSync(prebuildsPath)) {
            try {
              const platforms = readdirSync(prebuildsPath, { withFileTypes: true });
              for (const platform of platforms) {
                if (platform.isDirectory()) {
                  const platformPath = join(prebuildsPath, platform.name);
                  try {
                    const nodeEntries = readdirSync(platformPath, { withFileTypes: true });
                    for (const nodeEntry of nodeEntries) {
                      if (nodeEntry.isDirectory() && nodeEntry.name.endsWith('.node')) {
                        organizedDirs.push(join(platformPath, nodeEntry.name));
                      }
                    }
                  } catch {
                    // Ignore
                  }
                }
              }
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  if (organizedDirs.length > 0) {
    NODEJS_MOBILE_BUILD_NATIVE_MODULES = '1';
  } else {
    // Check for .gyp files
    let hasGyp = false;
    try {
      const checkGyp = (dir: string): void => {
        if (hasGyp) return;
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.gyp')) {
              hasGyp = true;
              return;
            }
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
              checkGyp(join(dir, entry.name));
            }
          }
        } catch {
          // Ignore
        }
      };
      checkGyp(NODEJS_DIR);
    } catch {
      // Ignore
    }
    NODEJS_MOBILE_BUILD_NATIVE_MODULES = hasGyp ? '1' : '0';
  }
}

if (NODEJS_MOBILE_BUILD_NATIVE_MODULES !== '1') {
  process.exit(0);
}

// Delete object files
const deleteFiles = (dir: string, ext: string): void => {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(ext)) {
        try {
          unlinkSync(fullPath);
        } catch {
          // Ignore
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        deleteFiles(fullPath, ext);
      }
    }
  } catch {
    // Ignore
  }
};

deleteFiles(NODEJS_DIR, '.o');
deleteFiles(NODEJS_DIR, '.a');

// Create frameworks and override-dlopen-paths-data.json
let scriptPath = join(PLUGIN_SCRIPTS_PATH, 'create-frameworks-and-override.js');
if (!existsSync(scriptPath)) {
  scriptPath = join(PROJECT_DIR, '../../node_modules/capacitor-nodejs/scripts/create-frameworks-and-override.ts');
}

if (!existsSync(scriptPath)) {
  console.log('Warning: create-frameworks-and-override script not found, skipping framework creation');
  process.exit(0);
}

// Run the framework creation script
let frameworkOutput = '';
try {
  frameworkOutput = execSync(`node "${scriptPath}" "${NODEJS_DIR}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
} catch (error: any) {
  frameworkOutput = error.stdout?.toString() || error.message || '';
}

console.log(frameworkOutput);

// Extract framework paths from output
const frameworkPaths: string[] = [];
for (const line of frameworkOutput.split('\n')) {
  if (line.startsWith('FRAMEWORK:')) {
    const path = line.substring('FRAMEWORK:'.length).trim();
    if (path) {
      frameworkPaths.push(path);
    }
  }
}

// Embed frameworks
function embedFramework(frameworkPath: string): void {
  const frameworkName = basename(frameworkPath);
  const destPath = join(TARGET_BUILD_DIR, FRAMEWORKS_FOLDER_PATH, frameworkName);

  mkdirSync(join(TARGET_BUILD_DIR, FRAMEWORKS_FOLDER_PATH), { recursive: true });

  if (frameworkPath !== destPath) {
    if (existsSync(destPath)) {
      rmSync(destPath, { recursive: true, force: true });
    }
    cpSync(frameworkPath, destPath, { recursive: true });
  } else {
    console.log(`Framework ${frameworkName} already at destination, skipping copy`);
  }

  // Sign the framework
  if (EXPANDED_CODE_SIGN_IDENTITY) {
    try {
      execSync(
        `/usr/bin/codesign --force --sign ${EXPANDED_CODE_SIGN_IDENTITY} --preserve-metadata=identifier,entitlements,flags --timestamp=none "${destPath}"`,
        { stdio: 'ignore' }
      );
    } catch {
      // Ignore
    }
  }
}

// Embed frameworks found by the script
for (const frameworkPath of frameworkPaths) {
  if (frameworkPath && existsSync(frameworkPath)) {
    const stat = statSync(frameworkPath);
    if (stat.isDirectory()) {
      embedFramework(frameworkPath);
    }
  }
}

// Also embed any frameworks found via recursive search (fallback)
const findFrameworks = (dir: string): string[] => {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && entry.name.endsWith('.framework')) {
        results.push(fullPath);
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        results.push(...findFrameworks(fullPath));
      }
    }
  } catch {
    // Ignore
  }
  return results;
};

for (const frameworkPath of findFrameworks(NODEJS_DIR)) {
  const frameworkName = basename(frameworkPath);
  const destPath = join(TARGET_BUILD_DIR, FRAMEWORKS_FOLDER_PATH, frameworkName);
  if (!existsSync(destPath)) {
    embedFramework(frameworkPath);
  }
}

// Cleanup
const cleanup = (dir: string): void => {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.deps' || entry.name.endsWith('.framework')) {
          rmSync(fullPath, { recursive: true, force: true });
        } else {
          cleanup(fullPath);
          // Check if it's inside a .deps or .framework directory
          const parent = basename(dir);
          if (parent === '.deps' || parent.endsWith('.framework')) {
            try {
              if (entry.isFile()) {
                unlinkSync(fullPath);
              } else {
                rmSync(fullPath, { recursive: true, force: true });
              }
            } catch {
              // Ignore
            }
          }
        }
      } else {
        const parent = basename(dir);
        if (parent === '.deps' || parent.endsWith('.framework')) {
          try {
            unlinkSync(fullPath);
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch {
    // Ignore
  }
};

cleanup(NODEJS_DIR);
