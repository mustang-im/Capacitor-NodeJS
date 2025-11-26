#!/bin/bash
# Build phase script to rebuild Node.js native modules for iOS


PROJECT_ROOT="$PROJECT_DIR/../.."   # adjust if needed

# Source nvm if HOME is defined
if [ -n "${HOME:-}" ]; then
  source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
fi

ASSETS_PATH="$(dirname "$PRODUCT_SETTINGS_PATH")"
NODE_PROJECT=$(jq -r '.plugins.CapacitorNodeJS.nodeDir' "$ASSETS_PATH/capacitor.config.json")
NODE_PROJECT_PATH="$CODESIGNING_FOLDER_PATH/public/$NODE_PROJECT"

# Determine if we need to rebuild native modules
if [ -z "$NODEJS_MOBILE_BUILD_NATIVE_MODULES" ]; then
  PREFERENCE_FILE_PATH="$CODESIGNING_FOLDER_PATH/public/NODEJS_MOBILE_BUILD_NATIVE_MODULES_VALUE.txt"
  if [ -f "$PREFERENCE_FILE_PATH" ]; then
    NODEJS_MOBILE_BUILD_NATIVE_MODULES="$(cat "$PREFERENCE_FILE_PATH" | xargs)"
  fi
fi

if [ -z "$NODEJS_MOBILE_BUILD_NATIVE_MODULES" ]; then
  gypfiles=($(find "$NODE_PROJECT_PATH/node_modules" -type f -name "*.gyp"))
  if [ ${#gypfiles[@]} -gt 0 ]; then
    NODEJS_MOBILE_BUILD_NATIVE_MODULES=1
  else
    NODEJS_MOBILE_BUILD_NATIVE_MODULES=0
  fi
fi

if [ "1" != "$NODEJS_MOBILE_BUILD_NATIVE_MODULES" ]; then
  echo "Skipping native module rebuild."
  exit 0
fi

echo "Cleaning old object files..."
find "$NODE_PROJECT_PATH" -name "*.o" -type f -delete
find "$NODE_PROJECT_PATH" -name "*.a" -type f -delete
find "$NODE_PROJECT_PATH" -name "*.node" -type f -delete
find "$NODE_PROJECT_PATH" -path "*/*.node/*" -delete
find "$NODE_PROJECT_PATH" -name "*.framework" -type d -delete
find "$NODE_PROJECT_PATH" -path "*/*.framework/*" -delete
find "$NODE_PROJECT_PATH" -path "*/.bin/*" -delete
find "$NODE_PROJECT_PATH" -name ".bin" -type d -delete

# Copy new libnode
mkdir -p "$PROJECT_ROOT/node_modules/nodejs-mobile-react-native/ios"
cp -rf "$PROJECT_ROOT/node_modules/capacitor-nodejs/ios/libnode" "$PROJECT_ROOT/node_modules/nodejs-mobile-react-native/ios"

# Copy nodejs-mobile-gyp
mkdir -p "$PROJECT_ROOT/node_modules/prebuild-for-nodejs-mobile/node_modules"
cp -rf "$PROJECT_ROOT/node_modules/nodejs-mobile-gyp" "$PROJECT_ROOT/node_modules/prebuild-for-nodejs-mobile/node_modules"

echo "Rebuilding native modules for platform: $PLATFORM_NAME, arch: $TARGET_ARCH"

PREBUILD_SCRIPT="$PROJECT_ROOT/node_modules/prebuild-for-nodejs-mobile/bin.js"

export npm_config_python=$(which python3)

# Rebuild each native module individually
for module in "$NODE_PROJECT_PATH/node_modules/"*/ ; do
  if [ -f "$module/binding.gyp" ]; then
    echo "Rebuilding native module: $module"
    cd "$module"
    # Set platform-specific flags
    if [ "$PLATFORM_NAME" == "iphoneos" ]; then
      node "$PREBUILD_SCRIPT" ios-arm64
    else
      node "$PREBUILD_SCRIPT" ios-arm64-simulator
    fi
  fi
done

echo "Native module rebuild completed."
