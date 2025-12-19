/**
 * Build system configuration
 */
export interface BuildConfig {
  // Input sources
  xmlSource: string;
  customComponentsFile: string;

  // Static data files
  containersFile: string;
  imagefsFile: string;
  defaultsFile: string;
  executionConfigFile: string;

  // Output directory
  outputDir: string;

  // GitHub configuration
  githubRepo: string;
  githubRelease: string;

  // URL configuration
  cdnBaseUrl: string;
  logoUrl: string;

  // Sync options
  downloadMissing: boolean;
  downloadDir: string;

  // Timestamp (null = use current time)
  timestamp: string | null;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: BuildConfig = {
  xmlSource: './data/sp_winemu_all_components12.xml',
  customComponentsFile: './data/custom_components.json',
  containersFile: './data/containers.json',
  imagefsFile: './data/imagefs.json',
  defaultsFile: './data/defaults.json',
  executionConfigFile: './data/execution_config.json',
  outputDir: './',
  githubRepo: 'Producdevity/gamehub-lite-api',
  githubRelease: 'Components',
  cdnBaseUrl:
    'https://github.com/Producdevity/gamehub-lite-api/releases/download/Components',
  logoUrl:
    'https://github.com/Producdevity/gamehub-lite-api/releases/download/Components/45e60d211d35955bd045aabfded4e64b.png',
  downloadMissing: false,
  downloadDir: './.tmp_components',
  timestamp: null,
};
