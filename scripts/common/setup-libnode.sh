#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/../../" && pwd)"
PROJECT_ROOT="$(cd "$PACKAGE_DIR/../../" && pwd)"
FORCE=false
PLATFORM=""

usage() {
  echo "Usage: $0 [--force <true|false>] [--platform <android|ios>]"
  echo "  --force      Force re-download/copy even if destination exists (requires true/false)"
  echo "  --platform   Only process specified platform (android or ios)"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --force)
      if [[ "$2" == "true" ]]; then
        FORCE=true
      else
        FORCE=false
      fi
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      if [[ "$PLATFORM" != "android" && "$PLATFORM" != "ios" ]]; then
        echo "Error: Platform must be 'android' or 'ios'"
        exit 1
      fi
      shift 2
      ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

get_latest_release_url() {
  local platform=$1
  local api_url="https://api.github.com/repos/nodejs-mobile/nodejs-mobile/releases/latest"
  local release_info
  release_info=$(curl -s "$api_url")
  local pattern
  if [[ "$platform" == "android" ]]; then
    pattern="nodejs-mobile-.*-android.zip"
  else
    pattern="nodejs-mobile-.*-ios.zip"
  fi
  echo "$release_info" | grep -o "https://[^\"]*${pattern}" | head -1
}

extract_config_value() {
  local key=$1
  local config_file=$2
  local ext="${config_file##*.}"
  if [[ "$ext" == "json" ]]; then
    grep -o "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$config_file" 2>/dev/null | \
      sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/' | head -1
  else
    grep -o "${key}[[:space:]]*:[[:space:]]*[\"'][^\"']*[\"']" "$config_file" 2>/dev/null | \
      sed "s/.*:[[:space:]]*[\"']\([^\"']*\)[\"']/\1/" | head -1
  fi
}

find_config_file() {
  for ext in ts js json; do
    local f="$PROJECT_ROOT/capacitor.config.$ext"
    if [[ -f "$f" ]]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

download_and_extract() {
  local url=$1
  local dest_dir=$2
  local temp_zip
  temp_zip=$(mktemp)
  echo "Downloading: $url"
  curl -L -o "$temp_zip" "$url"
  echo "Extracting to: $dest_dir"
  rm -rf "$dest_dir"
  mkdir -p "$dest_dir"
  unzip -q "$temp_zip" -d "$dest_dir"
  rm "$temp_zip"
  echo "Done!"
}

copy_local() {
  local src=$1
  local dest_dir=$2
  if [[ ! -e "$src" ]]; then
    echo "Error: Local path does not exist: $src"
    return 1
  fi
  echo "Copying from: $src"
  rm -rf "$dest_dir"
  mkdir -p "$dest_dir"
  if [[ -d "$src" ]]; then
    cp -r "$src"/* "$dest_dir"/
  elif [[ "$src" == *.zip ]]; then
    unzip -q "$src" -d "$dest_dir"
  else
    cp "$src" "$dest_dir"/
  fi
  echo "Done!"
}

process_platform() {
  local platform=$1
  local config_key=$2
  local dest_dir="$PACKAGE_DIR/$platform/libnode"
  if [[ -d "$dest_dir" && "$FORCE" != true ]]; then
    echo "[$platform] libnode already exists at $dest_dir (use --force to re-download)"
    return 0
  fi
  local config_file
  if ! config_file=$(find_config_file); then
    echo "Warning: No capacitor.config.{ts,js,json} found in $PROJECT_ROOT"
    local url
    url=$(get_latest_release_url "$platform")
    if [[ -n "$url" ]]; then
      echo "[$platform] Using fallback from nodejs-mobile latest release"
      download_and_extract "$url" "$dest_dir"
    else
      echo "Error: Could not get latest release URL"
      return 1
    fi
    return 0
  fi
  echo "Found config: $config_file"
  local lib_path
  lib_path=$(extract_config_value "$config_key" "$config_file")
  if [[ -z "$lib_path" ]]; then
    echo "[$platform] No $config_key found in config, using fallback"
    local url
    url=$(get_latest_release_url "$platform")
    if [[ -n "$url" ]]; then
      download_and_extract "$url" "$dest_dir"
    else
      echo "Error: Could not get latest release URL"
      return 1
    fi
    return 0
  fi
  echo "[$platform] Found $config_key: $lib_path"
  if [[ "$lib_path" =~ ^https?:// ]]; then
    download_and_extract "$lib_path" "$dest_dir"
  else
    if [[ ! "$lib_path" = /* ]]; then
      lib_path="$PROJECT_ROOT/$lib_path"
    fi
    copy_local "$lib_path" "$dest_dir"
  fi
}

echo "Project root: $PROJECT_ROOT"
echo "Package dir: $PACKAGE_DIR"
echo ""

if [[ -z "$PLATFORM" || "$PLATFORM" == "android" ]]; then
  echo "=== Processing Android ==="
  process_platform "android" "androidLibNode"
  echo ""
fi

if [[ -z "$PLATFORM" || "$PLATFORM" == "ios" ]]; then
  echo "=== Processing iOS ==="
  process_platform "ios" "iosLibNode"
  echo ""
fi

echo "All done!"
