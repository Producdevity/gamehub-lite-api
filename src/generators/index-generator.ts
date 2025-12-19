import type { ComponentRegistry } from '../registry/registry.js';
import type { ComponentTypeValue } from '../types/index.js';
import type { IndexFile, IndexCategory } from '../types/outputs.js';
import { COMPONENT_TYPE_META } from '../types/index.js';

/**
 * Generate the components/index file
 * Keys must be in alphabetical order to match original files
 */
export function generateIndex(registry: ComponentRegistry): IndexFile {
  const categories: IndexCategory[] = [];

  for (let type = 1; type <= 7; type++) {
    const typeValue = type as ComponentTypeValue;
    const meta = COMPONENT_TYPE_META[typeValue];
    const count = registry.getCountByType(typeValue);

    // Keys in alphabetical order
    categories.push({
      count,
      display_name: meta.displayName,
      manifest_url: `/components/${meta.manifest}`,
      name: meta.name,
      type: typeValue,
    });
  }

  return {
    code: 200,
    msg: 'Success',
    data: {
      categories, // Keys in alphabetical order
      total_components: registry.getTotalCount(),
    },
  };
}
