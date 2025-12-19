import { readFileSync } from 'fs';
import type { Component, ComponentTypeValue } from '../types/index.js';

/**
 * Raw entry structure from XML JSON
 */
interface XmlEntry {
  id: number;
  name: string;
  type: number;
  version: string;
  version_code: number;
  file_name: string;
  file_md5: string;
  file_size: number; // Number in XML, convert to string
  download_url: string;
  logo: string;
  status: number;
  is_steam: number;
  display_name: string;
  base: null;
  blurb: string | null;
  framework: string | null;
  framework_type: string | null;
  sub_data: unknown | null;
  upgrade_msg: string | null;
  fileType: number;
}

/**
 * Wrapper structure in XML
 */
interface XmlComponentWrapper {
  depInfo: null;
  entry: XmlEntry;
  isBase: boolean;
  isDep: boolean;
  name: string;
  state: string;
  version: string;
}

/**
 * Parse the sp_winemu XML file and extract components
 */
export function parseXmlFile(filePath: string): Component[] {
  const content = readFileSync(filePath, 'utf-8');
  return parseXmlContent(content);
}

/**
 * Parse XML content string
 */
export function parseXmlContent(content: string): Component[] {
  const components: Component[] = [];

  // Match all <string name="...">JSON</string> elements
  const pattern = /<string name="([^"]*)">(\{.*?\})<\/string>/gs;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const componentName = match[1];
    const jsonStr = match[2];

    try {
      const wrapper = JSON.parse(jsonStr) as XmlComponentWrapper;
      const entry = wrapper.entry;

      // Validate required fields
      if (!entry || typeof entry.id !== 'number' || !entry.name) {
        continue;
      }

      // Validate type is 1-7
      if (entry.type < 1 || entry.type > 7) {
        console.warn(`Skipping component with invalid type: ${entry.name} (type=${entry.type})`);
        continue;
      }

      const component: Component = {
        id: entry.id,
        name: entry.name,
        type: entry.type as ComponentTypeValue,
        version: entry.version || '1.0.0',
        version_code: entry.version_code || 1,
        file_name: entry.file_name,
        file_md5: entry.file_md5,
        file_size: String(entry.file_size), // Convert to string
        download_url: entry.download_url,
        logo: entry.logo,
        display_name: entry.display_name ?? '', // Preserve empty strings from XML
      };

      // Add optional fields if present
      if (entry.blurb) {
        component.blurb = entry.blurb;
      }
      if (entry.is_steam !== undefined) {
        component.is_steam = entry.is_steam;
      }

      components.push(component);
    } catch (e) {
      console.warn(`   Warning: Malformed JSON for component "${componentName}" - add to custom_components.json if needed`);
    }
  }

  return components;
}

