#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, join } from 'path';

import { DEFAULT_CONFIG, type Container, type Imagefs } from '../types/index.js';
import { toGitHubAssetKey, toGitHubAssetName } from '../utils/github-assets.js';
import { formatJson } from '../utils/json.js';

const INPUT_DIR = 'tmp';
const DEFAULT_DOWNLOAD_DIR = join(DEFAULT_CONFIG.downloadDir, 'gamehub-xml');
const COMPONENTS_XML = 'sp_winemu_all_components12.xml';
const IMAGEFS_XML = 'sp_winemu_all_imageFs.xml';
const CONTAINERS_XML = 'sp_winemu_all_containers.xml';
const VALID_COMPONENT_TYPES = new Set([1, 2, 3, 4, 5, 6, 7]);

type AssetKind = 'component' | 'imagefs' | 'container' | 'container-sub';

interface RawSubData {
  sub_file_name: string;
  sub_download_url: string;
  sub_file_md5: string;
}

interface RawEntry {
  base: unknown | null;
  blurb: string | null;
  display_name: string;
  download_url: string;
  file_md5: string;
  file_name: string;
  file_size: number | string;
  fileType: number;
  framework: string | null;
  framework_type: string | null;
  id: number;
  is_steam: number;
  logo: string;
  name: string;
  status: number;
  sub_data: RawSubData | null;
  type: number;
  upgrade_msg: string | null;
  version: string;
  version_code: number;
}

interface RawWrapper {
  entry: RawEntry;
  name: string;
  state: string;
  version: string;
  [key: string]: unknown;
}

interface XmlRecord {
  line: number;
  stringName: string;
  wrapper: RawWrapper;
}

interface AssetCandidate {
  kind: AssetKind;
  id: number;
  name: string;
  assetName: string;
  originalFileName: string;
  downloadUrl: string;
  fileMd5: string;
  fileSize: string | null;
  reasons: string[];
}

interface ParsedArgs {
  downloadAssets: boolean;
  downloadDir: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let downloadAssets = false;
  let downloadDir = DEFAULT_DOWNLOAD_DIR;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--download-assets' || arg === '--download') {
      downloadAssets = true;
    } else if (arg === '--download-dir') {
      const next = args[++i];
      if (!next) {
        throw new Error('--download-dir requires a path');
      }
      downloadDir = next;
    } else if (arg.startsWith('--download-dir=')) {
      downloadDir = arg.slice('--download-dir='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { downloadAssets, downloadDir };
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;');
}

function parseXmlMap(filePath: string): XmlRecord[] {
  const content = readFileSync(filePath, 'utf-8');
  return parseXmlMapContent(filePath, content);
}

function parseXmlMapContent(source: string, content: string): XmlRecord[] {
  const pattern = /<string name="([^"]*)">([\s\S]*?)<\/string>/g;
  const records: XmlRecord[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const stringName = decodeXmlEntities(match[1]);
    const body = decodeXmlEntities(match[2].trim());
    const line = content.slice(0, match.index).split('\n').length;

    try {
      records.push({
        line,
        stringName,
        wrapper: JSON.parse(body) as RawWrapper,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${source}:${line}: malformed JSON for "${stringName}": ${message}`);
    }
  }

  if (records.length === 0) {
    throw new Error(`No <string> records found in ${source}`);
  }

  return records;
}

function formatComponentXml(records: XmlRecord[]): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
    '<map>',
  ];

  for (const record of records) {
    lines.push(
      `  <string name="${escapeXmlAttribute(record.stringName)}">${JSON.stringify(record.wrapper)}</string>`
    );
  }

  lines.push('</map>');
  return `${lines.join('\n')}\n`;
}

function toGitHubFileName(fileName: string): string {
  return toGitHubAssetName(fileName);
}

function gitHubUrl(assetName: string): string {
  return `${DEFAULT_CONFIG.cdnBaseUrl}/${toGitHubFileName(assetName)}`;
}

function basenameFromUrl(url: string): string {
  const withoutFragment = url.split('#')[0] ?? url;
  const withoutQuery = withoutFragment.split('?')[0] ?? withoutFragment;
  const name = basename(withoutQuery);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function encodedDownloadUrl(url: string): string {
  return url.replace(/ /g, '%20');
}

function splitArchiveExtension(fileName: string): { stem: string; extension: string } {
  if (fileName.endsWith('.tar.zst')) {
    return { stem: fileName.slice(0, -'.tar.zst'.length), extension: '.tar.zst' };
  }

  const dot = fileName.lastIndexOf('.');
  if (dot === -1) {
    return { stem: fileName, extension: '' };
  }

  return { stem: fileName.slice(0, dot), extension: fileName.slice(dot) };
}

function uniqueAssetName(entry: RawEntry): string {
  const original = toGitHubFileName(entry.file_name);
  const { extension } = splitArchiveExtension(original);
  const stem = toGitHubFileName(entry.name || splitArchiveExtension(original).stem);
  return `${stem}-${entry.file_md5}${extension}`;
}

function dedupeOfficialAssetNames(records: XmlRecord[]): void {
  const byKey = new Map<string, XmlRecord[]>();

  for (const record of records) {
    const entry = record.wrapper.entry;
    if (!hasDownload(entry)) continue;

    const key = toGitHubAssetKey(entry.file_name);
    const group = byKey.get(key) ?? [];
    group.push(record);
    byKey.set(key, group);
  }

  const usedKeys = new Set(byKey.keys());
  for (const recordsForName of byKey.values()) {
    recordsForName.sort((a, b) => a.wrapper.entry.id - b.wrapper.entry.id);

    for (const [index, record] of recordsForName.entries()) {
      const entry = record.wrapper.entry;
      const signature = `${entry.file_md5}:${entry.file_size}`;
      const hasConflict = recordsForName.some(
        (other) => `${other.wrapper.entry.file_md5}:${other.wrapper.entry.file_size}` !== signature
      );

      if (index === 0 || !hasConflict) {
        continue;
      }

      let nextName = uniqueAssetName(entry);
      let suffix = 2;
      while (usedKeys.has(toGitHubAssetKey(nextName))) {
        const { stem, extension } = splitArchiveExtension(uniqueAssetName(entry));
        nextName = `${stem}-${suffix}${extension}`;
        suffix += 1;
      }

      entry.file_name = nextName;
      usedKeys.add(toGitHubAssetKey(nextName));
    }
  }
}

function hasDownload(entry: RawEntry): boolean {
  return Boolean(entry.download_url && entry.file_name && entry.file_md5);
}

function assetFieldsChanged(current: RawEntry | undefined, next: RawEntry): boolean {
  if (!current) return true;
  return (
    current.file_name !== next.file_name ||
    current.file_md5 !== next.file_md5 ||
    String(current.file_size) !== String(next.file_size)
  );
}

function rawEntryById(records: XmlRecord[]): Map<number, RawEntry> {
  const entries = new Map<number, RawEntry>();
  for (const record of records) {
    entries.set(record.wrapper.entry.id, record.wrapper.entry);
  }
  return entries;
}

function readTrackedText(path: string): string | null {
  const result = spawnSync('git', ['show', `HEAD:${path}`], {
    encoding: 'utf-8',
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.status !== 0 || result.error) {
    return null;
  }

  return result.stdout;
}

function readBaselineText(path: string): { content: string | null; source: string } {
  const tracked = readTrackedText(path);
  if (tracked !== null) {
    return { content: tracked, source: `HEAD:${path}` };
  }

  if (!existsSync(path)) {
    return { content: null, source: path };
  }

  return { content: readFileSync(path, 'utf-8'), source: path };
}

function parseCurrentComponents(): Map<number, RawEntry> {
  const path = DEFAULT_CONFIG.xmlSource;
  const baseline = readBaselineText(path);
  if (baseline.content === null) {
    return new Map();
  }

  return rawEntryById(parseXmlMapContent(baseline.source, baseline.content));
}

function loadCurrentJson<T>(path: string): T | null {
  const baseline = readBaselineText(path);
  if (baseline.content === null) {
    return null;
  }

  return JSON.parse(baseline.content) as T;
}

function addAsset(
  assets: Map<string, AssetCandidate>,
  candidate: Omit<AssetCandidate, 'reasons'> & { reason: string }
): void {
  const existing = assets.get(candidate.assetName);
  if (existing) {
    if (existing.fileMd5 !== candidate.fileMd5) {
      throw new Error(
        `Conflicting MD5 for asset ${candidate.assetName}: ${existing.fileMd5} vs ${candidate.fileMd5}`
      );
    }
    existing.reasons.push(candidate.reason);
    return;
  }

  assets.set(candidate.assetName, {
    kind: candidate.kind,
    id: candidate.id,
    name: candidate.name,
    assetName: candidate.assetName,
    originalFileName: candidate.originalFileName,
    downloadUrl: candidate.downloadUrl,
    fileMd5: candidate.fileMd5,
    fileSize: candidate.fileSize,
    reasons: [candidate.reason],
  });
}

function collectComponentAssets(
  validComponents: XmlRecord[],
  currentComponents: Map<number, RawEntry>,
  assets: Map<string, AssetCandidate>
): void {
  for (const record of validComponents) {
    const entry = record.wrapper.entry;
    if (!hasDownload(entry)) continue;

    const current = currentComponents.get(entry.id);
    if (!assetFieldsChanged(current, entry)) continue;

    addAsset(assets, {
      kind: 'component',
      id: entry.id,
      name: entry.name,
      assetName: toGitHubFileName(entry.file_name),
      originalFileName: entry.file_name,
      downloadUrl: entry.download_url,
      fileMd5: entry.file_md5,
      fileSize: String(entry.file_size),
      reason: current ? 'changed component asset' : 'new component',
    });
  }
}

function toImagefs(record: XmlRecord): Imagefs {
  const entry = record.wrapper.entry;
  const fileName = toGitHubFileName(entry.file_name);

  return {
    id: entry.id,
    version: entry.version,
    version_code: entry.version_code,
    name: entry.name,
    logo: DEFAULT_CONFIG.logoUrl,
    upgrade_msg: entry.upgrade_msg ?? '',
    blurb: entry.blurb ?? '',
    download_url: gitHubUrl(fileName),
    file_md5: entry.file_md5,
    file_size: String(entry.file_size),
    file_name: fileName,
    display_name: entry.display_name || entry.name,
  };
}

function collectImagefsAsset(
  record: XmlRecord,
  current: Imagefs | null,
  assets: Map<string, AssetCandidate>
): void {
  const entry = record.wrapper.entry;
  const changed =
    !current ||
    current.file_name !== toGitHubFileName(entry.file_name) ||
    current.file_md5 !== entry.file_md5 ||
    current.file_size !== String(entry.file_size);

  if (!changed || !hasDownload(entry)) return;

  addAsset(assets, {
    kind: 'imagefs',
    id: entry.id,
    name: entry.name,
    assetName: toGitHubFileName(entry.file_name),
    originalFileName: entry.file_name,
    downloadUrl: entry.download_url,
    fileMd5: entry.file_md5,
    fileSize: String(entry.file_size),
    reason: current ? 'changed imagefs asset' : 'new imagefs asset',
  });
}

function toContainer(record: XmlRecord): Container {
  const entry = record.wrapper.entry;
  const fileName = toGitHubFileName(entry.file_name);
  const container: Container = {
    id: entry.id,
    version: entry.version,
    version_code: entry.version_code,
    name: entry.name,
    logo: DEFAULT_CONFIG.logoUrl,
    file_md5: entry.file_md5,
    file_size: String(entry.file_size),
    download_url: gitHubUrl(fileName),
    file_name: fileName,
    framework: entry.framework as Container['framework'],
    framework_type: entry.framework_type as Container['framework_type'],
    display_name: entry.display_name || entry.name,
    is_steam: entry.is_steam as Container['is_steam'],
  };

  if (entry.sub_data) {
    const subAssetName = toGitHubFileName(
      basenameFromUrl(entry.sub_data.sub_download_url) || entry.sub_data.sub_file_name
    );
    container.sub_data = {
      sub_file_name: entry.sub_data.sub_file_name,
      sub_download_url: gitHubUrl(subAssetName),
      sub_file_md5: entry.sub_data.sub_file_md5,
    };
  }

  return container;
}

function currentContainerById(containers: Container[] | null): Map<number, Container> {
  return new Map((containers ?? []).map((container) => [container.id, container]));
}

function collectContainerAssets(
  records: XmlRecord[],
  currentContainers: Map<number, Container>,
  assets: Map<string, AssetCandidate>
): void {
  for (const record of records) {
    const entry = record.wrapper.entry;
    const current = currentContainers.get(entry.id);
    const mainChanged =
      !current ||
      current.file_name !== toGitHubFileName(entry.file_name) ||
      current.file_md5 !== entry.file_md5 ||
      current.file_size !== String(entry.file_size);

    if (mainChanged && hasDownload(entry)) {
      addAsset(assets, {
        kind: 'container',
        id: entry.id,
        name: entry.name,
        assetName: toGitHubFileName(entry.file_name),
        originalFileName: entry.file_name,
        downloadUrl: entry.download_url,
        fileMd5: entry.file_md5,
        fileSize: String(entry.file_size),
        reason: current ? 'changed container asset' : 'new container',
      });
    }

    if (!entry.sub_data) continue;

    const subAssetName = toGitHubFileName(
      basenameFromUrl(entry.sub_data.sub_download_url) || entry.sub_data.sub_file_name
    );
    const currentSubAssetName = current?.sub_data
      ? basenameFromUrl(current.sub_data.sub_download_url)
      : '';
    const subChanged =
      !current?.sub_data ||
      current.sub_data.sub_file_name !== entry.sub_data.sub_file_name ||
      current.sub_data.sub_file_md5 !== entry.sub_data.sub_file_md5 ||
      currentSubAssetName !== subAssetName;

    if (!subChanged) continue;

    addAsset(assets, {
      kind: 'container-sub',
      id: entry.id,
      name: entry.name,
      assetName: subAssetName,
      originalFileName: entry.sub_data.sub_file_name,
      downloadUrl: entry.sub_data.sub_download_url,
      fileMd5: entry.sub_data.sub_file_md5,
      fileSize: null,
      reason: current ? 'changed container sub-asset' : 'new container sub-asset',
    });
  }
}

function md5File(path: string): string {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

function fileKind(path: string): string {
  const result = spawnSync('file', ['-b', path], { encoding: 'utf-8' });
  if (result.status === 0) {
    return result.stdout.trim();
  }
  return 'unknown';
}

function verifyDownloadedAsset(asset: AssetCandidate, path: string): string {
  const actualMd5 = md5File(path);
  if (actualMd5.toLowerCase() !== asset.fileMd5.toLowerCase()) {
    throw new Error(
      `${asset.assetName}: MD5 mismatch (${actualMd5} !== ${asset.fileMd5})`
    );
  }

  if (asset.fileSize && statSync(path).size !== Number(asset.fileSize)) {
    throw new Error(
      `${asset.assetName}: size mismatch (${statSync(path).size} !== ${asset.fileSize})`
    );
  }

  return fileKind(path);
}

function downloadAssets(assets: AssetCandidate[], downloadDir: string): void {
  mkdirSync(downloadDir, { recursive: true });

  for (const asset of assets) {
    const outputPath = join(downloadDir, asset.assetName);
    if (existsSync(outputPath)) {
      try {
        const kind = verifyDownloadedAsset(asset, outputPath);
        console.log(`  ✓ ${asset.assetName} already downloaded (${kind})`);
        continue;
      } catch {
        unlinkSync(outputPath);
      }
    }

    const partialPath = `${outputPath}.partial`;
    if (existsSync(partialPath)) {
      unlinkSync(partialPath);
    }

    console.log(`  ↓ ${asset.assetName}`);
    const result = spawnSync(
      'curl',
      ['-L', '--fail', '--retry', '3', '--connect-timeout', '30', '-o', partialPath, encodedDownloadUrl(asset.downloadUrl)],
      { stdio: 'inherit' }
    );

    if (result.status !== 0) {
      throw new Error(`Download failed for ${asset.assetName}`);
    }

    const kind = verifyDownloadedAsset(asset, partialPath);
    renameSync(partialPath, outputPath);
    console.log(`  ✓ ${asset.assetName} (${kind})`);
  }
}

function writeAssetManifest(assets: AssetCandidate[], downloadDir: string): void {
  mkdirSync(downloadDir, { recursive: true });
  writeFileSync(
    join(downloadDir, 'asset-manifest.json'),
    `${formatJson({
      total: assets.length,
      assets,
    })}\n`
  );
}

function summarizeAssets(assets: AssetCandidate[]): string {
  const knownBytes = assets.reduce((sum, asset) => sum + Number(asset.fileSize ?? 0), 0);
  const unknown = assets.filter((asset) => !asset.fileSize).length;
  const mib = knownBytes / 1024 / 1024;
  const unknownSuffix = unknown > 0 ? `, plus ${unknown} unknown-size sub-asset(s)` : '';
  return `${assets.length} asset(s), ${mib.toFixed(2)} MiB known size${unknownSuffix}`;
}

async function main(): Promise<void> {
  const args = parseArgs();

  const componentPath = join(INPUT_DIR, COMPONENTS_XML);
  const imagefsPath = join(INPUT_DIR, IMAGEFS_XML);
  const containersPath = join(INPUT_DIR, CONTAINERS_XML);

  console.log('Importing GameHub XML');
  console.log('=====================\n');

  const officialComponents = parseXmlMap(componentPath);
  const validComponents = officialComponents.filter((record) =>
    VALID_COMPONENT_TYPES.has(record.wrapper.entry.type)
  );
  dedupeOfficialAssetNames(validComponents);
  const skippedComponents = officialComponents.filter(
    (record) => !VALID_COMPONENT_TYPES.has(record.wrapper.entry.type)
  );

  const officialImagefs = parseXmlMap(imagefsPath);
  if (officialImagefs.length !== 1) {
    throw new Error(`Expected exactly one imagefs record, found ${officialImagefs.length}`);
  }

  const officialContainers = parseXmlMap(containersPath);
  const currentComponents = parseCurrentComponents();
  const currentImagefs = loadCurrentJson<Imagefs>(DEFAULT_CONFIG.imagefsFile);
  const currentContainers = currentContainerById(
    loadCurrentJson<Container[]>(DEFAULT_CONFIG.containersFile)
  );

  const assets = new Map<string, AssetCandidate>();
  collectComponentAssets(validComponents, currentComponents, assets);
  collectImagefsAsset(officialImagefs[0]!, currentImagefs, assets);
  collectContainerAssets(officialContainers, currentContainers, assets);

  writeFileSync(DEFAULT_CONFIG.xmlSource, formatComponentXml(validComponents));
  writeFileSync(DEFAULT_CONFIG.imagefsFile, `${formatJson(toImagefs(officialImagefs[0]!))}\n`);
  writeFileSync(
    DEFAULT_CONFIG.containersFile,
    `${formatJson(officialContainers.map(toContainer))}\n`
  );

  const assetList = Array.from(assets.values()).sort((a, b) =>
    a.assetName.localeCompare(b.assetName)
  );
  writeAssetManifest(assetList, args.downloadDir);

  console.log(`Components: ${officialComponents.length} official XML records, ${validComponents.length} imported`);
  if (skippedComponents.length > 0) {
    const skippedSummary = skippedComponents
      .map((record) => `${record.wrapper.entry.type}:${record.wrapper.entry.name}`)
      .join(', ');
    console.log(`Skipped non-download setting records: ${skippedComponents.length}`);
    console.log(`  ${skippedSummary}`);
  }
  console.log(`Imagefs: ${officialImagefs[0]!.wrapper.entry.version}`);
  console.log(`Containers: ${officialContainers.length}`);
  console.log(`Release assets: ${summarizeAssets(assetList)}`);
  console.log(`Asset manifest: ${join(args.downloadDir, 'asset-manifest.json')}`);

  if (args.downloadAssets) {
    console.log('\nDownloading release assets...');
    downloadAssets(assetList, args.downloadDir);
  } else if (assetList.length > 0) {
    console.log('\nDownload assets:');
    console.log(`  npm run import-gamehub-xml -- --download-assets`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
