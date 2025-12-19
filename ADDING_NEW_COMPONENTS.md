# Adding New Components to GameHub Lite API

This guide explains how to add new components (drivers, libraries, etc.) to the GameHub Lite API.

## Overview

The GameHub Lite API uses a TypeScript build system that automatically generates all API endpoint files from:
- `data/sp_winemu_all_components12.xml` - Official GameHub component data
- `data/custom_components.json` - Custom components not in the XML

**You no longer need to manually edit multiple JSON files.** The build system handles all file generation and validation.

## Component Types

| Type | Name | Description |
|------|------|-------------|
| 1 | Box64/FEX | x86_64 emulators for ARM64 |
| 2 | GPU Drivers | Turnip, Adreno, Mali drivers |
| 3 | DXVK | DirectX 9/10/11 to Vulkan |
| 4 | VKD3D | Direct3D 12 to Vulkan |
| 5 | Games | Game-specific patches/configs |
| 6 | Libraries | Windows DLLs for Wine |
| 7 | Steam | Steam client components |

## Method 1: Updating from New XML (Recommended)

When you receive an updated `sp_winemu_all_components12.xml` file:

### Step 1: Replace the XML File

```bash
cp ./sp_winemu_all_components12.xml ./data/sp_winemu_all_components12.xml
```

### Step 2: Run the Build

```bash
npm run build
```

The build system will:
1. Parse all components from the XML
2. Merge with any custom components
3. Generate all 16 API endpoint files
4. Validate all data
5. Check if all component files exist on GitHub release
6. Report any missing files with download/upload instructions

### Step 3: Handle Missing Files

If the build reports missing files, it will provide:

1. **Download commands** to fetch files from the original CDN:
   ```bash
   mkdir -p /tmp/missing_components && cd /tmp/missing_components

   # Example download command for each missing file:
   curl -L -o "component_name.tzst" "https://original-cdn-url/component.tzst"
   ```

2. **Upload command** to add files to GitHub release:
   ```bash
   # replace Producdevity/gamehub-lite-api with your fork
   gh release upload Components "file1.tzst" "file2.tzst" --repo Producdevity/gamehub-lite-api
   ```

### Step 4: Verify and Commit

After uploading missing files, run the build again:

```bash
npm run build
```

If all files exist, commit the changes:

```bash
git add .
git commit -m "Update components from new XML"
git push
```

## Method 2: Adding Custom Components

For components that don't exist in the XML (or have malformed XML data):

### Step 1: Edit custom_components.json

Add the component to `data/custom_components.json`:

```json
{
  "components": [
    {
      "id": 316,
      "name": "steam_9866232",
      "type": 7,
      "version": "1.0.0",
      "version_code": 1,
      "file_name": "steam_9866232.tar.zst",
      "file_md5": "3d9d01362622a782a27ae691427b786c",
      "file_size": "41192642"
    }
  ]
}
```

**Required fields:**
- `id` - Unique component ID (check highest existing ID)
- `name` - Component name
- `type` - Component type (1-7)
- `version` - Version string
- `version_code` - Version number
- `file_name` - Name of the file on GitHub release
- `file_md5` - MD5 hash of the file
- `file_size` - File size in bytes (as STRING, not number)

### Step 2: Upload the File

Upload the component file to the GitHub release:

```bash
gh release upload Components "component_file.tzst" --repo Producdevity/gamehub-lite-api
```

### Step 3: Build and Verify

```bash
npm run build
```

## GitHub Filename Compatibility

**Important:** GitHub automatically replaces spaces with dots in release asset filenames.

The build system handles this automatically:
- XML file name: `Torchlight II.tzst`
- GitHub file name: `Torchlight.II.tzst`
- Generated download URL: `https://github.com/.../Torchlight.II.tzst`

When uploading files with spaces, GitHub will rename them. The build system accounts for this when checking for missing files.

## Updating Default Components

To change which components are selected by default, edit `data/defaults.json`:

```json
{
  "dxvk": 24,
  "vkd3d": 7,
  "steamClient": 334,
  "container": 2,
  "genericComponentIds": [7, 8, 24, 345],
  "qualcommComponentIds": [7, 8, 25, 345, 48]
}
```

- `dxvk` - Default DXVK component ID
- `vkd3d` - Default VKD3D component ID
- `steamClient` - Default Steam client component ID
- `container` - Default container ID
- `genericComponentIds` - Components for generic ARM execution preset
- `qualcommComponentIds` - Components for Qualcomm-specific preset

## Validation

Run validation without generating files:

```bash
npm run validate
```

This checks:
- All required data is present
- Component IDs are unique
- MD5 hashes are a valid format
- Default component IDs exist
- All referenced components exist

## Generated Files

The build system generates these 16 files:

**Component Manifests** (`components/`):
- `box64_manifest` - Type 1 components
- `drivers_manifest` - Type 2 components
- `dxvk_manifest` - Type 3 components
- `vkd3d_manifest` - Type 4 components
- `games_manifest` - Type 5 components
- `libraries_manifest` - Type 6 components
- `steam_manifest` - Type 7 components
- `index` - Component counts by type
- `downloads` - All downloadable files

**Simulator Endpoints** (`simulator/`):
- `v2/getAllComponentList` - All components
- `v2/getComponentList` - Type 1 components only
- `v2/getContainerList` - Wine/Proton containers
- `v2/getDefaultComponent` - Default selections
- `v2/getImagefsDetail` - Firmware info
- `executeScript/generic` - Generic ARM preset
- `executeScript/qualcomm` - Qualcomm preset

## Troubleshooting

### Build fails with "Missing files"

The build intentionally fails if component files don't exist on GitHub. This prevents deploying broken configurations.

**Solution:** Upload the missing files using the provided commands, then rebuild.

### Component is not appearing in app

1. Check the component exists in XML or `custom_components.json`
2. Run `npm run build` to regenerate all files
3. Verify the file exists on GitHub release
4. Wait 5 minutes for the CDN cache to expire

### Invalid MD5 hash error

Ensure the MD5 hash is exactly 32 lowercase hexadecimal characters.

### file_size must be a string error

In `custom_components.json`, `file_size` must be a string of the file size in bytes:
```json
"file_size": "41192642"  // Correct
"file_size": 41192642    // Wrong - will cause validation error
```

## Quick Reference

```bash
# Full build with validation and missing file check
npm run build

# Validate only (no file generation)
npm run validate

# Check GitHub release assets manually
gh release view Components --repo Producdevity/gamehub-lite-api --json assets

# Upload files to release
gh release upload Components file1.tzst file2.tzst --repo Producdevity/gamehub-lite-api
```

---

**Last Updated:** December 2025
