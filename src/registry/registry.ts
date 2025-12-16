import type {
  Component,
  ComponentTypeValue,
  Container,
  Imagefs,
  Defaults,
  ExecutionConfig,
  BuildConfig,
} from '../types/index.js';
import { COMPONENT_TYPE_META } from '../types/index.js';

/**
 * Central registry holding all data
 */
export class ComponentRegistry {
  private components: Map<number, Component> = new Map();
  private componentsByType: Map<ComponentTypeValue, Component[]> = new Map();
  private componentsByName: Map<string, Component> = new Map();

  public containers: Container[] = [];
  public imagefs: Imagefs | null = null;
  public defaults: Defaults | null = null;
  public executionConfig: ExecutionConfig | null = null;
  public config: BuildConfig;

  constructor(config: BuildConfig) {
    this.config = config;

    // Initialize type maps
    for (let type = 1; type <= 7; type++) {
      this.componentsByType.set(type as ComponentTypeValue, []);
    }
  }

  /**
   * Add components to a registry
   */
  addComponents(components: Component[]): void {
    for (const component of components) {
      this.addComponent(component);
    }
  }

  /**
   * Add a single component
   */
  addComponent(component: Component): void {
    // Check for duplicate ID
    if (this.components.has(component.id)) {
      const existing = this.components.get(component.id)!;
      console.warn(
        `Duplicate ID ${component.id}: "${component.name}" conflicts with "${existing.name}". Keeping first.`
      );
      return;
    }

    // Rewrite download URL to GitHub CDN
    const rewrittenComponent: Component = {
      ...component,
      download_url: `${this.config.cdnBaseUrl}/${component.file_name}`,
      logo: this.config.logoUrl,
    };

    this.components.set(component.id, rewrittenComponent);
    this.componentsByType.get(component.type)!.push(rewrittenComponent);
    this.componentsByName.set(component.name, rewrittenComponent);
  }

  /**
   * Get component by ID
   */
  getById(id: number): Component | undefined {
    return this.components.get(id);
  }

  /**
   * Get component by name
   */
  getByName(name: string): Component | undefined {
    return this.componentsByName.get(name);
  }

  /**
   * Get all components of a type
   */
  getByType(type: ComponentTypeValue): Component[] {
    return this.componentsByType.get(type) || [];
  }

  /**
   * Get all components
   */
  getAllComponents(): Component[] {
    return Array.from(this.components.values());
  }

  /**
   * Get total component count
   */
  getTotalCount(): number {
    return this.components.size;
  }

  /**
   * Get count by type
   */
  getCountByType(type: ComponentTypeValue): number {
    return this.getByType(type).length;
  }

  /**
   * Get counts for all types
   */
  getCountsByType(): Record<ComponentTypeValue, number> {
    const counts: Record<number, number> = {};
    for (let type = 1; type <= 7; type++) {
      counts[type] = this.getCountByType(type as ComponentTypeValue);
    }
    return counts as Record<ComponentTypeValue, number>;
  }

  /**
   * Get the highest component ID
   */
  getHighestId(): number {
    let highest = 0;
    for (const id of this.components.keys()) {
      if (id > highest) highest = id;
    }
    return highest;
  }

  /**
   * Sort components by ID descending (newest first)
   */
  sortByIdDescending(components: Component[]): Component[] {
    return [...components].sort((a, b) => b.id - a.id);
  }

  /**
   * Sort components by type ascending, then ID descending within each type
   */
  sortByTypeAndIdDescending(components: Component[]): Component[] {
    return [...components].sort((a, b) => {
      if (a.type !== b.type) return a.type - b.type;
      return b.id - a.id;
    });
  }

  /**
   * Get type metadata
   */
  getTypeMeta(type: ComponentTypeValue) {
    return COMPONENT_TYPE_META[type];
  }

  /**
   * Validate registry data
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required data
    if (this.components.size === 0) {
      errors.push('No components loaded');
    }

    if (!this.imagefs) {
      errors.push('Imagefs not loaded');
    }

    if (this.containers.length === 0) {
      errors.push('No containers loaded');
    }

    if (!this.defaults) {
      errors.push('Defaults not loaded');
    }

    if (!this.executionConfig) {
      errors.push('Execution config not loaded');
    }

    // Validate each component
    for (const component of this.components.values()) {
      // Check file_size is a string
      if (typeof component.file_size !== 'string') {
        errors.push(`Component ${component.id}: file_size must be string`);
      }

      // Check file_md5 format
      if (!/^[a-f0-9]{32}$/i.test(component.file_md5)) {
        errors.push(`Component ${component.id}: invalid MD5 hash`);
      }

      // Check required fields
      if (!component.name) {
        errors.push(`Component ${component.id}: missing name`);
      }
      if (!component.file_name) {
        errors.push(`Component ${component.id}: missing file_name`);
      }
      if (!component.download_url) {
        errors.push(`Component ${component.id}: missing download_url`);
      }
    }

    // Validate default component references
    if (this.defaults) {
      if (!this.components.has(this.defaults.dxvk)) {
        errors.push(`Default dxvk ID ${this.defaults.dxvk} not found`);
      }
      if (!this.components.has(this.defaults.vkd3d)) {
        errors.push(`Default vkd3d ID ${this.defaults.vkd3d} not found`);
      }
      if (!this.components.has(this.defaults.steamClient)) {
        errors.push(`Default steamClient ID ${this.defaults.steamClient} not found`);
      }

      // Validate component_ids in execution scripts
      for (const id of this.defaults.genericComponentIds) {
        if (!this.components.has(id)) {
          errors.push(`Generic script component ID ${id} not found`);
        }
      }
      for (const id of this.defaults.qualcommComponentIds) {
        if (!this.components.has(id)) {
          errors.push(`Qualcomm script component ID ${id} not found`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
