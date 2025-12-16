import { readFileSync, existsSync } from 'fs';
import type { Component, ComponentTypeValue } from '../types/index.js';
import type { BuildConfig } from '../types/index.js';

/**
 * Custom component definition in custom_components.json
 */
interface CustomComponentDefinition {
  id: number;
  name: string;
  type: number;
  version: string;
  version_code?: number;
  file_name: string;
  file_md5: string;
  file_size: string;
  display_name?: string;
  blurb?: string;
}

/**
 * Custom components file structure
 */
interface CustomComponentsFile {
  version: string;
  description: string;
  components: CustomComponentDefinition[];
}

/**
 * Parse custom components file
 */
export function parseCustomComponents(
  filePath: string,
  config: BuildConfig
): Component[] {
  if (!existsSync(filePath)) {
    console.log(`   Custom components file not found: ${filePath}`);
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as CustomComponentsFile;

  const components: Component[] = [];

  for (const custom of data.components) {
    const component: Component = {
      id: custom.id,
      name: custom.name,
      type: custom.type as ComponentTypeValue,
      version: custom.version,
      version_code: custom.version_code || 1,
      file_name: custom.file_name,
      file_md5: custom.file_md5,
      file_size: custom.file_size,
      download_url: `${config.cdnBaseUrl}/${custom.file_name}`,
      logo: config.logoUrl,
      display_name: custom.display_name || custom.name,
    };

    if (custom.blurb) {
      component.blurb = custom.blurb;
    }

    components.push(component);
  }

  return components;
}
