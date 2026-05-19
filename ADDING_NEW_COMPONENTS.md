# Adding Components

## Overview

The TypeScript build generates API endpoint files from:
- `data/sp_winemu_all_components12.xml` - Official GameHub component data
- `data/custom_components.json` - Custom components not in the XML

Edit source data, then run the build. Generated endpoint files should not be edited by hand.

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

## Method 1: Updating from GameHub SharedPreferences XML

Install and run the official GameHub app, then copy the XML files from its app-data `shared_prefs/` directory. The prefix depends on device and access method; common paths are `/data/data/<gamehub-package>/shared_prefs/`, `/data/user/0/<gamehub-package>/shared_prefs/`, or an exposed path such as `/storage/<storage-volume>/data/shared_prefs/`.

### Step 1: Copy XML Files

Put these files in ignored `tmp/`:
- `tmp/sp_winemu_all_components12.xml`
- `tmp/sp_winemu_all_imageFs.xml`
- `tmp/sp_winemu_all_containers.xml`

### Step 2: Import

```bash
npm run import-gamehub-xml
```

Import writes:
- `data/sp_winemu_all_components12.xml`
- `data/imagefs.json`
- `data/containers.json`
- `.tmp_components/gamehub-xml/asset-manifest.json`

Types `10`, `12`, `13`, `94`, and `95` are settings records, not downloadable components.

### Step 3: Download Assets

```bash
npm run import-gamehub-xml -- --download-assets
```

Downloaded files are written to `.tmp_components/gamehub-xml/`. The importer checks MD5 hashes, known file sizes, and local file type.

`asset-manifest.json` is a local checklist. Do not upload it to GitHub Releases.

### Step 4: Check Release Asset Status

Compare local files with the `Components` release:

```bash
npm run release-assets:check
```

If hashes are unavailable for existing release assets:

```bash
npm run release-assets:check-deep
```

### Step 5: Upload Assets

Upload assets missing from the release:

```bash
npm run release-assets:upload-new
```

Replace changed same-name assets only when you intend to overwrite the release copy:

```bash
npm run release-assets:replace-changed
```

To replace only selected files, leave only those files in `.tmp_components/gamehub-xml/` and run:

```bash
npm run release-assets:replace-current
```

### Step 6: Run the Build

```bash
npm run build
```

Build:
1. Parse all components from the XML
2. Merge with any custom components
3. Generate all 16 API endpoint files
4. Validate all data
5. Check if all component files exist on GitHub release
6. Fails if release assets are still missing

### Step 7: Verify and Commit

If the build reports missing files, run `npm run release-assets:check`, upload the missing assets, then build again.

```bash
npm run build
```

If all files exist, commit the changes:

```bash
git add .
git commit -m "Update components from GameHub XML"
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

GitHub normalizes spaces and some punctuation in release asset names. The build uses the same names for URLs and release checks.

- `Torchlight II.tzst` -> `Torchlight.II.tzst`
- `DeadSpace(2023).tzst` -> `DeadSpace.2023.tzst`

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

Upload the missing files, then rebuild.

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
"file_size": "41192642"  // ok
"file_size": 41192642    // invalid
```

## Quick Reference

```bash
# Full build with validation and missing file check
npm run build

# Validate only (no file generation)
npm run validate

# Check local GameHub XML assets against the release
npm run release-assets:check

# Deep check when release hashes are unavailable
npm run release-assets:check-deep

# Upload files missing from the release
npm run release-assets:upload-new

# Replace changed same-name release assets
npm run release-assets:replace-changed

# Replace only the files currently present in .tmp_components/gamehub-xml/
npm run release-assets:replace-current
```

---

**Last Updated:** May 2026
