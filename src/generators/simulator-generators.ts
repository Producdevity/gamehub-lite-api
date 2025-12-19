import type { ComponentRegistry } from '../registry/registry.js';
import type { Component, Container, Imagefs } from '../types/index.js';
import { ComponentType } from '../types/index.js';
import type {
  AllComponentListFile,
  AllComponentEntry,
  ComponentListFile,
  ComponentListEntry,
  ContainerListFile,
  DefaultComponentFile,
  DefaultComponentEntry,
  EmptyComponentEntry,
  ImagefsDetailFile,
  ExecuteScriptFile,
  ExecuteComponent,
  ImagefsRef,
  ContainerRef,
} from '../types/outputs.js';
import { getTimestamp } from '../utils/json.js';

/**
 * Convert Component to AllComponentEntry format
 * Note: has is_ui, but NO blurb, NO gpu_range
 * Keys must be in alphabetical order to match the original response
 */
function toAllComponentEntry(component: Component): AllComponentEntry {
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
 * Convert Component to ComponentListEntry format
 * Note: has blurb and gpu_range, but NO is_ui
 * Keys must be in alphabetical order to match the original response
 */
function toComponentListEntry(component: Component): ComponentListEntry {
  return {
    blurb: component.blurb ?? '',
    display_name: component.display_name ?? '',
    download_url: component.download_url,
    file_md5: component.file_md5,
    file_name: component.file_name,
    file_size: component.file_size,
    gpu_range: component.gpu_range ?? '',
    id: component.id,
    logo: component.logo,
    name: component.name,
    type: component.type,
    version: component.version,
    version_code: component.version_code,
  };
}

/**
 * Convert Component to DefaultComponentEntry format
 * Keys must be in alphabetical order to match the original response
 */
function toDefaultComponentEntry(component: Component): DefaultComponentEntry {
  return {
    blurb: component.blurb ?? '',
    display_name: component.display_name ?? '',
    download_url: component.download_url,
    file_md5: component.file_md5,
    file_name: component.file_name,
    file_size: component.file_size,
    id: component.id,
    logo: component.logo,
    name: component.name,
    type: component.type,
    version: component.version,
    version_code: component.version_code,
  };
}

/**
 * Create an empty component entry for translator
 * Keys must be in alphabetical order to match the original response
 */
function createEmptyComponent(): EmptyComponentEntry {
  return {
    blurb: '',
    display_name: '',
    download_url: '',
    file_md5: '',
    file_name: '',
    file_size: '',
    id: 0,
    logo: '',
    name: '',
    type: 0,
    version: '',
    version_code: 0,
  };
}

/**
 * Convert Component to ExecuteComponent format
 * Keys must be in alphabetical order to match the original response
 */
function toExecuteComponent(component: Component): ExecuteComponent {
  return {
    base_type: 0,
    blurb: component.blurb ?? '',
    display_name: component.display_name ?? '',
    download_url: component.download_url,
    file_md5: component.file_md5,
    file_name: component.file_name,
    file_size: component.file_size,
    id: component.id,
    is_base: 0,
    is_ui: 1,
    logo: component.logo,
    name: component.name,
    type: component.type,
    version: component.version,
    version_code: component.version_code,
  };
}

/**
 * Convert Imagefs to ImagefsRef format
 * Keys must be in alphabetical order to match the original response
 */
function toImagefsRef(imagefs: Imagefs): ImagefsRef {
  return {
    display_name: imagefs.display_name,
    download_url: imagefs.download_url,
    file_md5: imagefs.file_md5,
    file_name: imagefs.file_name,
    file_size: imagefs.file_size,
    id: imagefs.id,
    logo: imagefs.logo,
    name: imagefs.name,
    version: imagefs.version,
    version_code: imagefs.version_code,
  };
}

/**
 * Convert Container to ContainerRef format
 * Keys must be in alphabetical order to match the original response
 */
function toContainerRef(container: Container): ContainerRef {
  return {
    blurb: '',
    display_name: container.display_name,
    download_url: container.download_url,
    file_md5: container.file_md5,
    file_name: container.file_name,
    file_size: container.file_size,
    framework: container.framework,
    framework_type: container.framework_type,
    id: container.id,
    is_steam: container.is_steam,
    logo: container.logo,
    name: container.name,
    sub_data: container.sub_data,
    version: container.version,
    version_code: container.version_code,
  };
}

// ============================================================================
// Generator Functions
// ============================================================================

/**
 * Generate simulator/v2/getAllComponentList
 */
export function generateAllComponentList(
  registry: ComponentRegistry,
  timestamp?: string
): AllComponentListFile {
  const allComponents = registry.getAllComponents();

  // Sort by type ascending, then ID descending within each type
  const sorted = registry.sortByTypeAndIdDescending(allComponents);

  const list = sorted.map(toAllComponentEntry);

  return {
    code: 200,
    msg: 'Success',
    data: {
      list,
      total: list.length,
    },
    time: timestamp || getTimestamp(),
  };
}

/**
 * Generate simulator/v2/getComponentList (Type 1 only)
 */
export function generateComponentList(
  registry: ComponentRegistry,
  timestamp?: string
): ComponentListFile {
  const type1Components = registry.getByType(ComponentType.BOX64_FEX);
  const sorted = registry.sortByIdDescending(type1Components);
  const list = sorted.map(toComponentListEntry);

  return {
    code: 200,
    msg: 'Success',
    data: {
      list,
      total: list.length,
      page: 1,
      pageSize: 10,
    },
    time: timestamp || getTimestamp(),
  };
}

/**
 * Reorder container keys to match the original file format
 */
function toOrderedContainer(container: Container) {
  return {
    display_name: container.display_name,
    download_url: container.download_url,
    file_md5: container.file_md5,
    file_name: container.file_name,
    file_size: container.file_size,
    framework: container.framework,
    framework_type: container.framework_type,
    id: container.id,
    is_steam: container.is_steam,
    logo: container.logo,
    name: container.name,
    sub_data: container.sub_data,
    version: container.version,
    version_code: container.version_code,
  };
}

/**
 * Generate simulator/v2/getContainerList
 */
export function generateContainerList(
  registry: ComponentRegistry,
  timestamp?: string
): ContainerListFile {
  const orderedContainers = registry.containers.map(toOrderedContainer);

  return {
    code: 200,
    msg: 'Success',
    data: orderedContainers,
    time: timestamp || getTimestamp(),
  };
}

/**
 * Generate simulator/v2/getDefaultComponent
 */
export function generateDefaultComponent(
  registry: ComponentRegistry,
  timestamp?: string
): DefaultComponentFile {
  const defaults = registry.defaults!;

  const dxvk = registry.getById(defaults.dxvk);
  const vkd3d = registry.getById(defaults.vkd3d);
  const steamClient = registry.getById(defaults.steamClient);

  if (!dxvk || !vkd3d || !steamClient) {
    throw new Error('Default components not found in registry');
  }

  return {
    code: 200,
    msg: 'Success',
    data: {
      container: null,
      gpu: null,
      dxvk: toDefaultComponentEntry(dxvk),
      vkd3d: toDefaultComponentEntry(vkd3d),
      translator: createEmptyComponent(),
      steamClient: toDefaultComponentEntry(steamClient),
    },
    time: timestamp || getTimestamp(),
  };
}

/**
 * Generate simulator/v2/getImagefsDetail
 */
export function generateImagefsDetail(
  registry: ComponentRegistry,
  timestamp?: string
): ImagefsDetailFile {
  const imagefs = registry.imagefs!;

  const orderedImagefs = {
    id: imagefs.id,
    version: imagefs.version,
    version_code: imagefs.version_code,
    name: imagefs.name,
    logo: imagefs.logo,
    upgrade_msg: imagefs.upgrade_msg,
    blurb: imagefs.blurb,
    download_url: imagefs.download_url,
    file_md5: imagefs.file_md5,
    file_size: imagefs.file_size,
    file_name: imagefs.file_name,
    display_name: imagefs.display_name,
  };

  return {
    code: 200,
    msg: 'Success',
    data: orderedImagefs,
    time: timestamp || getTimestamp(),
  };
}

/**
 * Generate simulator/executeScript/generic or qualcomm
 */
export function generateExecuteScript(
  registry: ComponentRegistry,
  variant: 'generic' | 'qualcomm',
  timestamp?: string
): ExecuteScriptFile {
  const defaults = registry.defaults!;
  const executionConfig = registry.executionConfig!;
  const imagefs = registry.imagefs!;

  // Get container
  const container = registry.containers.find((c) => c.id === defaults.container);
  if (!container) {
    throw new Error(`Container ${defaults.container} not found`);
  }

  // Get component IDs and context based on variant
  const componentIds =
    variant === 'generic'
      ? defaults.genericComponentIds
      : defaults.qualcommComponentIds;
  const executionContext =
    variant === 'generic' ? defaults.genericContext : defaults.qualcommContext;

  // Get components
  const components: ExecuteComponent[] = [];
  for (const id of componentIds) {
    const component = registry.getById(id);
    if (component) {
      components.push(toExecuteComponent(component));
    }
  }

  return {
    code: 200,
    msg: 'Success',
    data: {
      audio_driver: executionConfig.audio_driver,
      component: components,
      component_ids: componentIds,
      container: toContainerRef(container),
      container_id: defaults.container,
      controller: executionConfig.controller,
      cpu_limitations: executionConfig.cpu_limitations,
      directx_panel: executionConfig.directx_panel,
      environment: executionConfig.environment,
      execution_context: executionContext,
      imagefs: toImagefsRef(imagefs),
      launch_windowed_mode: executionConfig.launch_windowed_mode,
      start_param: executionConfig.start_param,
      translations: executionConfig.translations,
      video_memory: executionConfig.video_memory,
    },
    time: timestamp || getTimestamp(),
  };
}
