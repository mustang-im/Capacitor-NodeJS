#!/usr/bin/env python3
import os
import json
import hashlib
import plistlib
import subprocess
import shutil
from pathlib import Path
from typing import List, Dict

def migrate_prebuilds_to_build_release(project_path: Path) -> None:
    """
    Moves .node directories from prebuilds/ios-arm64 to build/Release.
    This ensures they are in the standard location that Node.js modules expect.
    """
    print("Migrating prebuilt modules to build/Release directory...")
    node_modules_path = project_path / "node_modules"

    if not node_modules_path.exists():
        return

    for package_dir in node_modules_path.iterdir():
        if not package_dir.is_dir():
            continue

        prebuilds_dir = package_dir / "prebuilds" / "ios-arm64"
        build_release_dir = package_dir / "build" / "Release"

        if not prebuilds_dir.exists():
            continue

        # Ensure the destination directory exists
        build_release_dir.mkdir(parents=True, exist_ok=True)

        for node_dir in prebuilds_dir.glob("*.node"):
            if not node_dir.is_dir():
                continue

            destination_path = build_release_dir / node_dir.name
            if destination_path.exists():
                print(f"  - Removing existing module at {destination_path.relative_to(project_path)}")
                shutil.rmtree(str(destination_path))

            print(f"  + Moving {node_dir.name} to build/Release")
            shutil.move(str(node_dir), str(destination_path))

    print("Migration complete.\n")


def find_valid_node_modules(project_path: Path) -> List[Dict[str, str]]:
    """
    Finds all valid .node directories in the build/Release folder.
    """
    frameworks = []
    invalid_count = 0
    node_modules_path = project_path / "node_modules"

    print("Searching for native modules in build/Release...")
    for root, dirs, files in os.walk(node_modules_path):
        if '.deps' in dirs:
            dirs.remove('.deps')

        # We are looking for a DIRECTORY whose name ends with .node
        if Path(root).name.endswith('.node'):
            module_node_dir = Path(root)
            print(f"Found potential module directory: {module_node_dir.relative_to(project_path)}")

            # This directory must contain exactly one file: the binary.
            if len(files) != 1:
                print(f'Skipping "{module_node_dir.name}". Expected to find only one file inside, but found {len(files)}.')
                invalid_count += 1
                continue

            binary_file = files[0]
            binary_path = module_node_dir / binary_file
            if not binary_path.is_file():
                print(f'Skipping "{module_node_dir.name}". The item found inside is not a file.')
                invalid_count += 1
                continue

            # Verify the file is a Mach-O dynamically linked shared library
            try:
                result = subprocess.run(
                    ['file', str(binary_path)], capture_output=True, text=True, check=True
                )
                if 'dynamically linked shared library' not in result.stdout:
                    print(f'Skipping "{module_node_dir.name}". Not a dynamically linked shared library.')
                    invalid_count += 1
                    continue
            except (subprocess.SubprocessError, FileNotFoundError):
                print(f'Warning: Could not verify file type for "{module_node_dir.name}" with the `file` command. Assuming it is valid.')
                pass

            # The path for the JSON should be the .node directory, not the file inside it.
            original_dir_relative_path = module_node_dir.relative_to(project_path)

            # Calculate unique framework name and paths based on the directory path
            hash_value = hashlib.sha1(str(original_dir_relative_path).encode('utf-8')).hexdigest()
            new_framework_name = f'node{hash_value}'
            new_framework_path = module_node_dir.parent / f'{new_framework_name}.framework'

            frameworks.append({
                'original_dir_path': module_node_dir,
                'original_relative_path_parts': list(original_dir_relative_path.parts),
                'original_binary_name': binary_file,
                'new_framework_name': new_framework_name,
                'new_framework_path': new_framework_path
            })

    print(f"Found {len(frameworks)} valid frameworks and {invalid_count} invalid frameworks.")
    if not frameworks:
        print("No valid framework native modules were found. Skipping integration.")
        return []

    return frameworks


def generate_binary_plist(output_path: Path, bundle_name: str, env: Dict[str, str]) -> None:
    """Generate a complete iOS-style binary Info.plist."""
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


def process_all_frameworks(project_path: Path) -> None:
    """Discovers and processes all frameworks sequentially."""
    # Step 1: Move modules from prebuilds to build/Release
    migrate_prebuilds_to_build_release(project_path)

    # Step 2: Find the modules in their new location
    frameworks_to_process = find_valid_node_modules(project_path)
    if not frameworks_to_process:
        return

    overrides = []

    # Step 3: Process each framework one by one
    for framework in frameworks_to_process:
        original_dir_path = framework['original_dir_path']
        new_framework_path = framework['new_framework_path']
        original_binary_name = framework['original_binary_name']
        new_framework_name = framework['new_framework_name']

        print(f"Processing {original_dir_path.name}...")

        # 1. Rename the .node directory to a .framework directory
        shutil.move(str(original_dir_path), str(new_framework_path))

        # 2. Rename the binary inside the framework to match the framework's name
        old_binary_path = new_framework_path / original_binary_name
        new_binary_path = new_framework_path / new_framework_name
        old_binary_path.rename(new_binary_path)

        # 3. Generate the Info.plist inside the .framework
        plist_path = new_framework_path / "Info.plist"
        generate_binary_plist(plist_path, new_framework_name, os.environ)

        # 4. Create the empty placeholder FILE at the original .node DIRECTORY's location.
        placeholder_file_path = framework['original_dir_path']
        placeholder_file_path.touch()

        log_path = placeholder_file_path.relative_to(project_path)
        print(f"  + Created placeholder file at {log_path}")

        # 5. Add the JSON override entry for this module
        new_path_parts = ['..', '..', 'Frameworks', f'{new_framework_name}.framework', new_framework_name]
        overrides.append({
            'originalpath': framework['original_relative_path_parts'],
            'newpath': new_path_parts
        })

    # Write the final JSON override file
    json_path = project_path / "override-dlopen-paths-data.json"
    json_content = json.dumps(overrides, indent=2)
    json_path.write_text(json_content)

    print("\n--- Generated override-dlopen-paths-data.json ---")
    print(json_content)
    print("--------------------------------------------------")

    # Copy the runtime preload script to the project root
    script_dir = Path(__file__).parent
    preload_src = script_dir / "override-dlopen-paths-preload.js"
    preload_dst = project_path / "override-dlopen-paths-preload.js"
    if preload_src.exists():
        shutil.copy2(str(preload_src), str(preload_dst))
    else:
        print(f"Warning: Preload script not found at {preload_src}")

    print(f"\nSuccessfully processed {len(frameworks_to_process)} prebuild outputs into frameworks.")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 process_frameworks.py <projectPath>")
        sys.exit(1)

    project = Path(sys.argv[1]).resolve()
    if not project.is_dir():
        print("Error: Provided path is not a valid directory.")
        sys.exit(1)

    process_all_frameworks(project)


if __name__ == "__main__":
    import sys
    main()