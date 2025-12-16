import type { ComponentRegistry } from '../registry/registry.js';
import type { ComponentTypeValue, Component } from '../types/index.js';
import type { ManifestFile, ManifestComponent } from '../types/outputs.js';
import { COMPONENT_TYPE_META } from '../types/index.js';

/**
 * Convert a Component to ManifestComponent format
 * Keys must be in alphabetical order to match original files
 */
function toManifestComponent(component: Component): ManifestComponent {
  return {
    display_name: component.display_name ?? '',
    download_url: component.download_url,
    file_md5: component.file_md5,
    file_name: component.file_name,
    file_size: component.file_size,
    id: component.id,
    is_ui: 1,
    logo: component.logo,
    name: component.name,
    type: component.type,
    version: component.version,
    version_code: component.version_code,
  };
}

/**
 * Generate a manifest file for a specific component type
 */
export function generateManifest(
  registry: ComponentRegistry,
  type: ComponentTypeValue
): ManifestFile {
  const meta = COMPONENT_TYPE_META[type];
  const components = registry.getByType(type);
  const sorted = registry.sortByIdDescending(components);
  const manifestComponents = sorted.map(toManifestComponent);

  return {
    code: 200,
    msg: 'Success',
    data: {
      type,
      type_name: meta.name,
      display_name: meta.displayName,
      total: manifestComponents.length,
      components: manifestComponents,
    },
  };
}

/**
 * Generate all manifest files
 */
export function generateAllManifests(
  registry: ComponentRegistry
): Map<string, ManifestFile> {
  const manifests = new Map<string, ManifestFile>();

  for (let type = 1; type <= 7; type++) {
    const typeValue = type as ComponentTypeValue;
    const meta = COMPONENT_TYPE_META[typeValue];
    const manifest = generateManifest(registry, typeValue);
    manifests.set(meta.manifest, manifest);
  }

  return manifests;
}
