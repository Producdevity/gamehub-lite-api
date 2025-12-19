# GameHub Lite API

Privacy-respecting static JSON API for the GameHub Android app. This repository hosts all configuration files, component manifests, and API responses.

**GameHub Lite App/Patch Repository:** `https://github.com/Producdevity/gamehub-lite`

## Build System

This repository uses a TypeScript build system that automatically generates all API endpoint files from:
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

The build system automatically checks if all component files exist on the GitHub release and will:
1. Report any missing files
2. Provide download commands from the official CDN
3. Provide upload commands for GitHub
4. **Fail the build** if files are missing (prevents broken deployments)

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

## GitHub Compatibility

GitHub release assets automatically replace spaces with dots in file names. The build system handles this by:
1. Storing original file names from XML
2. Converting spaces to dots for GitHub URLs
3. Checking files exist on GitHub with the converted names

Example: `Torchlight II.tzst` → `Torchlight.II.tzst`

## Adding New Components

### From Updated XML

1. Replace `data/sp_winemu_all_components12.xml` with the new version
2. Run `npm run build`
3. Review the diff and commit changes
4. Upload any missing files reported by the build

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

This repository contains only:
- Public component manifests
- Open source configuration data
- CDN download links

No user data, analytics, or tracking.
