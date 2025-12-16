import type { ComponentRegistry } from '../registry/registry.js';
import type { DownloadsFile, DownloadEntry } from '../types/outputs.js';
import type { Component } from '../types/index.js';

/**
 * Convert a Component to DownloadEntry format
 * Note: downloads files do NOT have id, logo, display_name, version_code, is_ui
 * Keys must be in alphabetical order to match original files
 */
function toDownloadEntry(component: Component): DownloadEntry {
  return {
    download_url: component.download_url,
    file_md5: component.file_md5,
    file_name: component.file_name,
    file_size: component.file_size,
    name: component.name,
    type: component.type,
    version: component.version,
  };
}

/**
 * Generate the components/downloads file
 */
export function generateDownloads(registry: ComponentRegistry): DownloadsFile {
  const allComponents = registry.getAllComponents();

  // Sort by type, then by name for consistent ordering
  const sorted = [...allComponents].sort((a, b) => {
    if (a.type !== b.type) return a.type - b.type;
    return a.name.localeCompare(b.name);
  });

  const downloads = sorted.map(toDownloadEntry);

  return {
    code: 200,
    msg: 'Success',
    data: {
      downloads, // Keys in alphabetical order
      total: downloads.length,
    },
  };
}
