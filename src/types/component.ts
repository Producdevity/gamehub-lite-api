/**
 * Component type enum
 */
export const ComponentType = {
  BOX64_FEX: 1,
  GPU_DRIVERS: 2,
  DXVK: 3,
  VKD3D: 4,
  GAMES: 5,
  LIBRARIES: 6,
  STEAM: 7,
} as const;

export type ComponentTypeValue = (typeof ComponentType)[keyof typeof ComponentType];

/**
 * Component type metadata
 */
export const COMPONENT_TYPE_META: Record<
  ComponentTypeValue,
  { name: string; displayName: string; manifest: string }
> = {
  [ComponentType.BOX64_FEX]: {
    name: 'box64',
    displayName: 'Box64 Emulators',
    manifest: 'box64_manifest',
  },
  [ComponentType.GPU_DRIVERS]: {
    name: 'drivers',
    displayName: 'GPU Drivers',
    manifest: 'drivers_manifest',
  },
  [ComponentType.DXVK]: {
    name: 'dxvk',
    displayName: 'DXVK Layers',
    manifest: 'dxvk_manifest',
  },
  [ComponentType.VKD3D]: {
    name: 'vkd3d',
    displayName: 'VKD3D Proton',
    manifest: 'vkd3d_manifest',
  },
  [ComponentType.GAMES]: {
    name: 'games',
    displayName: 'Game Patches',
    manifest: 'games_manifest',
  },
  [ComponentType.LIBRARIES]: {
    name: 'libraries',
    displayName: 'System Libraries',
    manifest: 'libraries_manifest',
  },
  [ComponentType.STEAM]: {
    name: 'steam',
    displayName: 'Steam Components',
    manifest: 'steam_manifest',
  },
};

/**
 * Base component - the canonical data model
 */
export interface Component {
  // Identity
  id: number;
  name: string; // e.g., "Box64-0.39.tzst"
  type: ComponentTypeValue;

  // Version
  version: string; // "1.0.0" format
  version_code: number; // numeric, for comparison

  // File info
  file_name: string; // e.g., "Box64-0.39.tzst"
  file_md5: string; // 32-char hex
  file_size: string; // Bytes as string
  download_url: string; // Full CDN URL

  // Display
  logo: string; // Logo image URL
  display_name: string; // defaults to name if empty

  // Optional
  blurb?: string; // Description
  gpu_range?: string; // GPU compatibility info
  is_steam?: number; // 0, 1, or 2
}

/**
 * Container - Wine/Proton build (separate entity from components)
 */
export interface Container {
  id: number;
  name: string;
  version: string;
  version_code: number;

  file_name: string;
  file_md5: string;
  file_size: string; // Bytes
  download_url: string;

  logo: string;
  display_name: string;

  // Container-specific
  framework: 'X64' | 'arm64X' | 'X86';
  framework_type: 'stable' | 'proton' | 'experimental';
  is_steam: 0 | 1 | 2;

  // Optional nested download
  sub_data?: {
    sub_file_name: string;
    sub_download_url: string;
    sub_file_md5: string;
  };
}

/**
 * Imagefs - Base firmware (single entity)
 */
export interface Imagefs {
  id: number;
  name: string;
  version: string;
  version_code: number;
  file_name: string;
  file_md5: string;
  file_size: string;
  download_url: string;
  logo: string;
  display_name: string;
  upgrade_msg: string;
  blurb: string;
}

/**
 * Execution configuration (static)
 */
export interface ExecutionConfig {
  translations: {
    box64: Record<string, string>;
    fex: Record<string, string>;
  };
  controller: {
    dinput: boolean;
    xinput: boolean;
    xboxLayout: boolean;
    vibration: boolean;
  };
  audio_driver: number;
  cpu_limitations: number;
  video_memory: number;
  directx_panel: number;
  launch_windowed_mode: number;
  start_param: string;
  environment: string;
}

/**
 * Execution context parameters
 */
export interface ExecutionContext {
  params: [string, number, string, number, string, number];
  script_id: number;
  timestamp: number;
}

/**
 * Default component selection
 */
export interface Defaults {
  dxvk: number; // Component ID
  vkd3d: number; // Component ID
  steamClient: number; // Component ID
  container: number; // Container ID
  // Component IDs for execution scripts
  genericComponentIds: number[];
  qualcommComponentIds: number[];
  // Execution contexts
  genericContext: ExecutionContext;
  qualcommContext: ExecutionContext;
}
