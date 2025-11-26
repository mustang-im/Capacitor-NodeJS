#!/usr/bin/env python3
import os
import json
import hashlib
import plistlib
from pathlib import Path
from typing import List, Dict

def find_prebuild_outputs(base_path: Path):
    """
    Find all executables in the [module].node/[executable] structure created by prebuild.
    """
    binaries = []
    for root, dirs, files in os.walk(base_path):
        # Check if we are in a prebuild output directory (e.g., "module_name.node")
        if Path(root).name.endswith('.node'):
            # Find the executable file inside this directory
            for filename in files:
                full_path = Path(root) / filename
                if full_path.is_file(): # Ensure it's a file, not a directory
                    binaries.append(full_path)
                    break # Assume only one executable per .node dir
    return binaries


def sha1_hex(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def generate_binary_plist(output_path: Path, bundle_name: str, env: Dict[str, str]):
    """Generate a complete iOS-style binary Info.plist matching the expected template."""

    def env_get(key, default=""):
        return env.get(key, default)

    data = {
        "BuildMachineOSBuild": env_get("MAC_OS_X_PRODUCT_BUILD_VERSION"),
        "CFBundleDevelopmentRegion": "en",
        "CFBundleExecutable": bundle_name,
        "CFBundleIdentifier": f"com.janeasystems.{bundle_name}",
        "CFBundleInfoDictionaryVersion": "6.0",
        "CFBundleName": bundle_name,
        "CFBundlePackageType": "FMWK",
        "CFBundleShortVersionString": "1.0",
        "CFBundleSupportedPlatforms": ["iPhoneOS"],
        "CFBundleVersion": "1",

        "DTCompiler": env_get("DEFAULT_COMPILER"),
        "DTPlatformBuild": env_get("PLATFORM_PRODUCT_BUILD_VERSION"),
        "DTPlatformName": "iphoneos",
        "DTPlatformVersion": env_get("SDK_VERSION"),
        "DTSDKBuild": env_get("SDK_PRODUCT_BUILD_VERSION"),
        "DTSDKName": env_get("SDK_NAME"),
        "DTXcode": env_get("XCODE_VERSION_ACTUAL"),
        "DTXcodeBuild": env_get("XCODE_PRODUCT_BUILD_VERSION"),

        "MinimumOSVersion": "15.0",
        "NSHumanReadableCopyright": "",
        "UIDeviceFamily": [1, 2],
        "UIRequiredDeviceCapabilities": ["arm64"],
    }

    with output_path.open("wb") as fp:
        plistlib.dump(data, fp, fmt=plistlib.FMT_BINARY)


def process_frameworks(project_path: Path):
    binaries = find_prebuild_outputs(project_path)
    if not binaries:
        print("No valid prebuild outputs found.")
        return

    overrides = []
    preload_src = Path(__file__).parent / "override-dlopen-paths-preload.js"

    for binary_path in binaries:
        # The original module name is the parent of the .node directory
        module_node_dir = binary_path.parent
        module_name = module_node_dir.stem
        print(f"Processing {module_name}...")

        digest = sha1_hex(str(module_node_dir))
        new_name = f"node{digest}"

        # Create framework directory
        new_framework_dir = module_node_dir.parent / f"{new_name}.framework"
        new_framework_dir.mkdir(exist_ok=True)

        # Move the binary into the framework
        new_bin_path = new_framework_dir / new_name
        binary_path.rename(new_bin_path)

        # Create Info.plist
        plist_path = new_framework_dir / "Info.plist"
        generate_binary_plist(plist_path, new_name, os.environ)

        # --- FINAL, SIMPLE JSON OVERRIDE ENTRY ---
        # 'originalpath' is the path to the original .node directory
        # 'newpath' is the path to the new binary inside the framework
        # Both are relative to the same root: the project's public directory.
        
        original_path_parts = list(module_node_dir.relative_to(project_path).parts)
        new_path_parts = ["..", "..", "Frameworks", f"{new_name}.framework", new_name]

        overrides.append({
            "originalpath": original_path_parts,
            "newpath": new_path_parts
        })

        # Create an empty .node file at the original location
        placeholder_file_path = module_node_dir / f"{module_node_dir.name}.node"
        placeholder_file_path.touch()
        print(f"  + Created placeholder at {placeholder_file_path}")

        # Remove the now-empty .node directory
        module_node_dir.rmdir()

    # Write override JSON
    json_path = project_path / "override-dlopen-paths-data.json"
    json_path.write_text(json.dumps(overrides, indent=2))

    # Copy preload JS
    preload_dst = project_path / "override-dlopen-paths-preload.js"
    preload_dst.write_bytes(preload_src.read_bytes())

    print(f"Processed {len(binaries)} prebuild outputs into frameworks.")


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python3 process_frameworks.py <projectPath>")
        sys.exit(1)

    project = Path(sys.argv[1]).resolve()
    if not project.exists():
        print("Provided path does not exist.")
        sys.exit(1)

    process_frameworks(project)
