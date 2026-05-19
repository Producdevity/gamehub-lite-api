# GameHub Lite API

Static JSON API for the GameHub Lite app. This repository hosts configuration files, component manifests, and API responses.

**GameHub Lite App/Patch Repository:** `https://github.com/Producdevity/gamehub-lite`

## Build System

The TypeScript build generates API endpoint files from:
- `sp_winemu_all_components12.xml` - Official GameHub component data
- `data/custom_components.json` - Custom components not in the XML
- `data/*.json` - Static configuration files

### Quick Start

```bash
# Install dependencies
npm install

# Build all files
npm run build

# Validate without generating
npm run validate
```

### Build Output

The build system generates 16 API endpoint files:

**Component Manifests** (`components/`):
- `box64_manifest` - Type 1: Box64/FEX emulators
- `drivers_manifest` - Type 2: GPU drivers (Turnip, Adreno, etc.)
- `dxvk_manifest` - Type 3: DXVK layers
- `vkd3d_manifest` - Type 4: VKD3D Proton
- `games_manifest` - Type 5: Game patches/configs
- `libraries_manifest` - Type 6: Windows libraries
- `steam_manifest` - Type 7: Steam components
- `index` - Component counts by type
- `downloads` - All downloadable files

**Simulator Endpoints** (`simulator/`):
- `v2/getAllComponentList` - All components
- `v2/getComponentList` - Type 1 components only
- `v2/getContainerList` - Wine/Proton containers
- `v2/getDefaultComponent` - Default component selection
- `v2/getImagefsDetail` - Firmware info
- `executeScript/generic` - Generic ARM execution preset
- `executeScript/qualcomm` - Qualcomm-specific preset

### Missing Files Check

`npm run build` checks the `Components` release. Missing assets are listed by release filename and the build exits non-zero.

## Directory Structure

```
gamehub-lite-api/
├── src/                    # TypeScript source code
│   ├── index.ts           # Main entry point
│   ├── parsers/           # XML and JSON parsers
│   ├── generators/        # Output file generators
│   ├── registry/          # Component registry
│   ├── types/             # TypeScript types
│   └── utils/             # Utilities
├── data/                   # Configuration and source files
│   ├── sp_winemu_all_components12.xml  # Source XML from GameHub
│   ├── containers.json    # Wine/Proton containers
│   ├── imagefs.json       # Firmware configuration
│   ├── defaults.json      # Default component selection
│   ├── execution_config.json  # Execution settings
│   └── custom_components.json # Custom components
├── components/             # Generated manifests
├── simulator/              # Generated API endpoints
└── package.json
```

## Configuration Files

### data/defaults.json

Configures default component selections:

```json
{
  "dxvk": 24,
  "vkd3d": 7,
  "steamClient": 334,
  "container": 2,
  "genericComponentIds": [7, 8, 24, 345],
  "qualcommComponentIds": [7, 8, 25, 345, 48],
  "genericContext": { ... },
  "qualcommContext": { ... }
}
```

### data/custom_components.json

Add components that aren't in the official XML:

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

## GitHub Asset Names

GitHub normalizes spaces and some punctuation in release asset names. The build uses the same names for URLs and release checks.

- `Torchlight II.tzst` -> `Torchlight.II.tzst`
- `DeadSpace(2023).tzst` -> `DeadSpace.2023.tzst`

## Adding New Components

### From GameHub SharedPreferences XML

Install and run the official GameHub app, then copy the XML files from its app-data `shared_prefs/` directory. Depending on device/access method this may be under `/data/data/<gamehub-package>/shared_prefs/`, `/data/user/0/<gamehub-package>/shared_prefs/`, or an exposed path such as `/storage/<storage-volume>/data/shared_prefs/`.

1. Put the XML files in ignored `tmp/`:
   - `tmp/sp_winemu_all_components12.xml`
   - `tmp/sp_winemu_all_imageFs.xml`
   - `tmp/sp_winemu_all_containers.xml`
2. Import the XML:
   ```bash
   npm run import-gamehub-xml
   ```
   This writes tracked data files and `.tmp_components/gamehub-xml/asset-manifest.json`. Types `10`, `12`, `13`, `94`, and `95` are settings records, so they are skipped.
3. Download release assets referenced by changed or new records:
   ```bash
   npm run import-gamehub-xml -- --download-assets
   ```
   Files are written to ignored `.tmp_components/gamehub-xml/`. Do not upload `asset-manifest.json`.
4. Compare local assets with the `Components` release:
   ```bash
   npm run release-assets:check
   ```
5. Upload assets missing from the release:
   ```bash
   npm run release-assets:upload-new
   ```
6. Replace changed same-name assets only when you intend to overwrite the release copy:
   ```bash
   npm run release-assets:replace-changed
   ```
   To replace only selected files, leave only those files in `.tmp_components/gamehub-xml/` and run:
   ```bash
   npm run release-assets:replace-current
   ```
7. Run `npm run build`
8. Review the diff and commit changes

### Custom Components

1. Add to `data/custom_components.json`
2. Run `npm run build`
3. Upload the component file to GitHub release

## CDN and Downloads

Component files are hosted on GitHub Releases:
```
https://github.com/Producdevity/gamehub-lite-api/releases/download/Components/{filename}
```

The build system rewrites all download URLs to point to GitHub.

## Related Projects

| Repository | Description |
|------------|-------------|
| [gamehub-lite](https://github.com/Producdevity/gamehub-lite) | Main project with pre-built APK releases |
| [gamehub-lite-api](https://github.com/Producdevity/gamehub-lite-api) | Static JSON API hosting component manifests, configuration files, and mock responses that replace the original Chinese servers |
| [gamehub-lite-worker](https://github.com/Producdevity/gamehub-lite-worker) | Cloudflare Worker API proxy that handles token management, signature regeneration, privacy protection (IP hiding, fingerprint sanitization), and content routing |
| [gamehub-lite-news](https://github.com/Producdevity/gamehub-lite-news) | News aggregator that collects gaming news from RSS feeds and GitHub releases, transforms them into GameHub's API format |
| [gamehub-lite-token-refresh](https://github.com/Producdevity/gamehub-lite-token-refresh) | Automated token refresher that uses Mail.tm OTP authentication to maintain valid GameHub tokens, runs every 4 hours via Cloudflare Cron |

## Privacy

This repository contains public manifests, configuration data, and CDN links. It does not contain user data, analytics, or tracking.
