import type { ComponentTypeValue, Container, Imagefs, ExecutionConfig, ExecutionContext } from './component.js';

/**
 * Base API response wrapper
 */
interface ApiResponse<T> {
  code: 200;
  msg: 'Success';
  data: T;
}

interface ApiResponseWithTime<T> extends ApiResponse<T> {
  time: string;
}

// ============================================================================
// Manifest Files (components/*_manifest)
// ============================================================================

export interface ManifestComponent {
  id: number;
  name: string;
  display_name: string;
  version: string;
  version_code: number;
  type: ComponentTypeValue;
  download_url: string;
  file_md5: string;
  file_size: string;
  file_name: string;
  logo: string;
  is_ui: 1;
}

export interface ManifestData {
  type: ComponentTypeValue;
  type_name: string;
  display_name: string;
  total: number;
  components: ManifestComponent[];
}

export type ManifestFile = ApiResponse<ManifestData>;

// ============================================================================
// Index File (components/index)
// ============================================================================

export interface IndexCategory {
  type: ComponentTypeValue;
  name: string;
  display_name: string;
  count: number;
  manifest_url: string;
}

export interface IndexData {
  total_components: number;
  categories: IndexCategory[];
}

export type IndexFile = ApiResponse<IndexData>;

// ============================================================================
// Downloads File (components/downloads)
// ============================================================================

export interface DownloadEntry {
  name: string;
  type: ComponentTypeValue;
  version: string;
  download_url: string;
  file_name: string;
  file_size: string;
  file_md5: string;
}

export interface DownloadsData {
  total: number;
  downloads: DownloadEntry[];
}

export type DownloadsFile = ApiResponse<DownloadsData>;

// ============================================================================
// GetAllComponentList (simulator/v2/getAllComponentList)
// ============================================================================

export interface AllComponentEntry {
  id: number;
  version: string;
  version_code: number;
  type: ComponentTypeValue;
  name: string;
  logo: string;
  file_md5: string;
  file_size: string;
  download_url: string;
  file_name: string;
  display_name: string;
  is_ui: 1;
}

export interface AllComponentListData {
  list: AllComponentEntry[];
  total: number;
}

export type AllComponentListFile = ApiResponseWithTime<AllComponentListData>;

// ============================================================================
// GetComponentList (simulator/v2/getComponentList) - Type 1 only
// ============================================================================

export interface ComponentListEntry {
  id: number;
  version: string;
  version_code: number;
  type: ComponentTypeValue;
  name: string;
  logo: string;
  blurb: string;
  file_md5: string;
  file_size: string;
  download_url: string;
  file_name: string;
  display_name: string;
  gpu_range: string;
}

export interface ComponentListData {
  list: ComponentListEntry[];
  total: number;
  page: 1;
  pageSize: 10;
}

export type ComponentListFile = ApiResponseWithTime<ComponentListData>;

// ============================================================================
// GetContainerList (simulator/v2/getContainerList)
// ============================================================================

export type ContainerListFile = ApiResponseWithTime<Container[]>;

// ============================================================================
// GetDefaultComponent (simulator/v2/getDefaultComponent)
// ============================================================================

export interface DefaultComponentEntry {
  id: number;
  type: ComponentTypeValue;
  version: string;
  version_code: number;
  name: string;
  logo: string;
  blurb: string;
  download_url: string;
  file_md5: string;
  file_size: string;
  file_name: string;
  display_name: string;
}

export interface EmptyComponentEntry {
  id: 0;
  type: 0;
  version: '';
  version_code: 0;
  name: '';
  logo: '';
  blurb: '';
  download_url: '';
  file_md5: '';
  file_size: '';
  file_name: '';
  display_name: '';
}

export interface DefaultComponentData {
  container: null;
  gpu: null;
  dxvk: DefaultComponentEntry;
  vkd3d: DefaultComponentEntry;
  translator: DefaultComponentEntry | EmptyComponentEntry;
  steamClient: DefaultComponentEntry;
}

export type DefaultComponentFile = ApiResponseWithTime<DefaultComponentData>;

// ============================================================================
// GetImagefsDetail (simulator/v2/getImagefsDetail)
// ============================================================================

export type ImagefsDetailFile = ApiResponseWithTime<Imagefs>;

// ============================================================================
// ExecuteScript (simulator/executeScript/generic & qualcomm)
// ============================================================================

export interface ImagefsRef {
  id: number;
  version: string;
  version_code: number;
  name: string;
  download_url: string;
  file_md5: string;
  file_size: string;
  file_name: string;
  logo: string;
  display_name: string;
}

export interface ContainerRef extends Omit<Container, 'blurb'> {
  blurb: string;
}

export interface ExecuteComponent {
  id: number;
  version: string;
  version_code: number;
  type: ComponentTypeValue;
  name: string;
  logo: string;
  blurb: string;
  download_url: string;
  file_md5: string;
  file_size: string;
  file_name: string;
  display_name: string;
  is_base: 0;
  base_type: 0;
  is_ui: 1;
}

export interface ExecuteScriptData extends ExecutionConfig {
  imagefs: ImagefsRef;
  container_id: number;
  container: ContainerRef;
  component_ids: number[];
  component: ExecuteComponent[];
  execution_context: ExecutionContext;
}

export type ExecuteScriptFile = ApiResponseWithTime<ExecuteScriptData>;
