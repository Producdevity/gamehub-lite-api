import { execFileSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { ComponentRegistry } from '../registry/registry.js';
import type { BuildConfig } from '../types/index.js';
import { toGitHubAssetKey, toGitHubAssetName } from '../utils/github-assets.js';
import { formatJson } from '../utils/json.js';

interface GitHubReleaseAsset {
  name: string;
  size: number;
  state?: string;
  updated_at?: string;
  digest?: string | null;
  browser_download_url?: string;
}

interface ReleaseMd5Cache {
  version: 1;
  assets: Record<
    string,
    {
      name: string;
      size: number;
      updatedAt: string | null;
      digest: string | null;
      md5: string;
    }
  >;
}

type ReleaseAssetKind = 'component' | 'imagefs' | 'container' | 'container-sub';

export interface ExpectedReleaseAsset {
  kind: ReleaseAssetKind;
  id: number;
  name: string;
  githubFileName: string;
  fileMd5: string;
  fileSize: string | null;
}

interface MetadataConflict {
  githubFileName: string;
  groups: Array<{
    fileMd5: string;
    fileSize: string | null;
    assets: ExpectedReleaseAsset[];
  }>;
}

interface ReleaseSizeMismatch {
  asset: ExpectedReleaseAsset;
  releaseAsset: GitHubReleaseAsset;
}

interface ReleaseHashMismatch {
  asset: ExpectedReleaseAsset;
  releaseAsset: GitHubReleaseAsset;
  releaseMd5: string;
}

interface ReleaseNameMismatch {
  asset: ExpectedReleaseAsset;
  releaseAsset: GitHubReleaseAsset;
}

interface InvalidReleaseAsset {
  asset: ExpectedReleaseAsset;
  releaseAsset: GitHubReleaseAsset;
}

export interface ReleaseAssetCheckResult {
  total: number;
  verified: number;
  missing: ExpectedReleaseAsset[];
  invalidAssets: InvalidReleaseAsset[];
  metadataConflicts: MetadataConflict[];
  nameMismatches: ReleaseNameMismatch[];
  sizeMismatches: ReleaseSizeMismatch[];
  hashMismatches: ReleaseHashMismatch[];
}

function ghEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: '1',
    CLICOLOR: '0',
    FORCE_COLOR: '0',
    TERM: 'dumb',
  };
  delete env.GH_FORCE_TTY;
  delete env.CLICOLOR_FORCE;
  return env;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function getGitHubReleaseAssets(repo: string, release: string): Map<string, GitHubReleaseAsset> {
  const releaseOutput = execFileSync('gh', ['api', `repos/${repo}/releases/tags/${release}`], {
    encoding: 'utf-8',
    env: ghEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const releaseInfo = JSON.parse(stripAnsi(releaseOutput)) as { id: number };
  const assetsOutput = execFileSync(
    'gh',
    [
      'api',
      '--paginate',
      '--slurp',
      `repos/${repo}/releases/${releaseInfo.id}/assets?per_page=100`,
    ],
    { encoding: 'utf-8', env: ghEnv(), maxBuffer: 100 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const pages = JSON.parse(stripAnsi(assetsOutput)) as GitHubReleaseAsset[][];
  const assets = new Map<string, GitHubReleaseAsset>();

  for (const page of pages) {
    for (const asset of page) {
      assets.set(toGitHubAssetKey(asset.name), asset);
    }
  }

  return assets;
}

function hashFile(path: string): string {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

function isUploadedReleaseAsset(asset: GitHubReleaseAsset): boolean {
  return !asset.state || asset.state === 'uploaded';
}

function basenameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const part = parsed.pathname.split('/').filter(Boolean).pop();
    return part ? decodeURIComponent(part) : null;
  } catch {
    const part = url.split('?')[0]?.split('/').filter(Boolean).pop();
    return part || null;
  }
}

function assetLabel(asset: ExpectedReleaseAsset): string {
  return `${asset.kind} ${asset.name}, ID ${asset.id}`;
}

export function collectExpectedAssets(registry: ComponentRegistry): ExpectedReleaseAsset[] {
  const assets: ExpectedReleaseAsset[] = registry.getAllOriginalInfo().map((info) => ({
    kind: 'component',
    id: info.id,
    name: info.name,
    githubFileName: info.githubFileName,
    fileMd5: info.fileMd5,
    fileSize: info.fileSize,
  }));

  if (registry.imagefs) {
    assets.push({
      kind: 'imagefs',
      id: registry.imagefs.id,
      name: registry.imagefs.name,
      githubFileName: toGitHubAssetName(
        basenameFromUrl(registry.imagefs.download_url) ?? registry.imagefs.file_name
      ),
      fileMd5: registry.imagefs.file_md5.toLowerCase(),
      fileSize: registry.imagefs.file_size,
    });
  }

  for (const container of registry.containers) {
    assets.push({
      kind: 'container',
      id: container.id,
      name: container.name,
      githubFileName: toGitHubAssetName(
        basenameFromUrl(container.download_url) ?? container.file_name
      ),
      fileMd5: container.file_md5.toLowerCase(),
      fileSize: container.file_size,
    });

    if (container.sub_data) {
      assets.push({
        kind: 'container-sub',
        id: container.id,
        name: container.name,
        githubFileName: toGitHubAssetName(
          basenameFromUrl(container.sub_data.sub_download_url) ?? container.sub_data.sub_file_name
        ),
        fileMd5: container.sub_data.sub_file_md5.toLowerCase(),
        fileSize: null,
      });
    }
  }

  return assets;
}

function readReleaseMd5Cache(path: string): ReleaseMd5Cache {
  if (!existsSync(path)) {
    return { version: 1, assets: {} };
  }

  const cache = JSON.parse(readFileSync(path, 'utf-8')) as ReleaseMd5Cache;
  return cache.version === 1 && cache.assets ? cache : { version: 1, assets: {} };
}

function writeReleaseMd5Cache(path: string, cache: ReleaseMd5Cache): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, `${formatJson(cache)}\n`);
}

function getReleaseAssetMd5(
  asset: GitHubReleaseAsset,
  cachePath: string,
  cache: ReleaseMd5Cache
): string {
  const key = toGitHubAssetKey(asset.name);
  const updatedAt = asset.updated_at ?? null;
  const digest = asset.digest ?? null;
  const cached = cache.assets[key];

  if (
    cached &&
    cached.name === asset.name &&
    cached.size === asset.size &&
    cached.updatedAt === updatedAt &&
    cached.digest === digest
  ) {
    return cached.md5;
  }

  if (!asset.browser_download_url) {
    throw new Error(`${asset.name}: release asset has no download URL`);
  }

  const downloadDir = join(dirname(cachePath), 'release-md5-downloads');
  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }

  const outputPath = join(downloadDir, `${key}.partial`);
  if (existsSync(outputPath)) {
    unlinkSync(outputPath);
  }

  console.log(`   Hashing ${asset.name}`);
  const result = spawnSync(
    'curl',
    [
      '-L',
      '--fail',
      '--silent',
      '--show-error',
      '--retry',
      '3',
      '--connect-timeout',
      '30',
      '-o',
      outputPath,
      asset.browser_download_url,
    ],
    { stdio: 'inherit' }
  );

  if (result.status !== 0 || result.error) {
    throw new Error(`${asset.name}: failed to download release asset for MD5 check`);
  }

  const md5 = hashFile(outputPath);
  unlinkSync(outputPath);

  cache.assets[key] = {
    name: asset.name,
    size: asset.size,
    updatedAt,
    digest,
    md5,
  };
  writeReleaseMd5Cache(cachePath, cache);

  return md5;
}

export function checkReleaseAssets(
  registry: ComponentRegistry,
  config: BuildConfig
): ReleaseAssetCheckResult {
  const releaseAssets = getGitHubReleaseAssets(config.githubRepo, config.githubRelease);
  const expectedAssets = collectExpectedAssets(registry);
  const byAssetKey = new Map<string, ExpectedReleaseAsset[]>();

  for (const asset of expectedAssets) {
    const key = toGitHubAssetKey(asset.githubFileName);
    const assets = byAssetKey.get(key) ?? [];
    assets.push(asset);
    byAssetKey.set(key, assets);
  }

  const missing: ExpectedReleaseAsset[] = [];
  const invalidAssets: InvalidReleaseAsset[] = [];
  const metadataConflicts: MetadataConflict[] = [];
  const nameMismatches: ReleaseNameMismatch[] = [];
  const sizeMismatches: ReleaseSizeMismatch[] = [];
  const hashMismatches: ReleaseHashMismatch[] = [];
  const hashQueue: Array<{ asset: ExpectedReleaseAsset; releaseAsset: GitHubReleaseAsset }> = [];

  for (const [assetKey, assets] of byAssetKey) {
    const releaseAsset = releaseAssets.get(assetKey);
    if (!releaseAsset) {
      missing.push(...assets);
      continue;
    }

    if (!isUploadedReleaseAsset(releaseAsset)) {
      invalidAssets.push(...assets.map((asset) => ({ asset, releaseAsset })));
      continue;
    }

    const expectedGroups = new Map<string, ExpectedReleaseAsset[]>();
    for (const asset of assets) {
      const key = `${asset.fileMd5}:${asset.fileSize ?? ''}`;
      const group = expectedGroups.get(key) ?? [];
      group.push(asset);
      expectedGroups.set(key, group);
    }

    if (expectedGroups.size > 1) {
      metadataConflicts.push({
        githubFileName: assets[0]!.githubFileName,
        groups: Array.from(expectedGroups.entries()).map(([key, groupedAssets]) => {
          const [fileMd5, fileSize] = key.split(':');
          return { fileMd5: fileMd5!, fileSize: fileSize || null, assets: groupedAssets };
        }),
      });
      continue;
    }

    const asset = assets[0]!;
    const expectedName = toGitHubAssetName(asset.githubFileName);
    if (releaseAsset.name !== expectedName) {
      nameMismatches.push({ asset, releaseAsset });
      continue;
    }

    const expectedSize = asset.fileSize === null ? NaN : Number(asset.fileSize);
    if (Number.isFinite(expectedSize) && releaseAsset.size !== expectedSize) {
      sizeMismatches.push({ asset, releaseAsset });
      continue;
    }

    hashQueue.push({ asset, releaseAsset });
  }

  const canHash =
    missing.length === 0 &&
    invalidAssets.length === 0 &&
    metadataConflicts.length === 0 &&
    nameMismatches.length === 0 &&
    sizeMismatches.length === 0;
  let verified = 0;

  if (canHash) {
    const cachePath = join(config.downloadDir, 'release-md5-cache.json');
    const cache = readReleaseMd5Cache(cachePath);

    for (const item of hashQueue) {
      const releaseMd5 = getReleaseAssetMd5(item.releaseAsset, cachePath, cache);
      verified++;
      if (releaseMd5.toLowerCase() !== item.asset.fileMd5.toLowerCase()) {
        hashMismatches.push({ ...item, releaseMd5 });
      }
    }
  }

  return {
    total: expectedAssets.length,
    verified,
    missing,
    invalidAssets,
    metadataConflicts,
    nameMismatches,
    sizeMismatches,
    hashMismatches,
  };
}

export function printReleaseAssetFailures(result: ReleaseAssetCheckResult): void {
  if (result.missing.length > 0) {
    console.log(`\n   Missing files: ${result.missing.length}`);
    for (const asset of result.missing) {
      console.log(`   - ${asset.githubFileName} (${assetLabel(asset)})`);
    }
  }

  if (result.invalidAssets.length > 0) {
    console.log(`\n   Invalid release assets: ${result.invalidAssets.length}`);
    for (const invalid of result.invalidAssets) {
      console.log(
        `   - ${invalid.asset.githubFileName} (${assetLabel(invalid.asset)}): ` +
          `GitHub state is ${invalid.releaseAsset.state ?? 'unknown'}`
      );
    }
  }

  if (result.metadataConflicts.length > 0) {
    console.log(`\n   Conflicting component metadata: ${result.metadataConflicts.length}`);
    for (const conflict of result.metadataConflicts) {
      console.log(`   - ${conflict.githubFileName}`);
      for (const group of conflict.groups) {
        const assets = group.assets.map((asset) => assetLabel(asset)).join(', ');
        console.log(`     ${group.fileMd5} size ${group.fileSize ?? 'unknown'}: ${assets}`);
      }
    }
  }

  if (result.nameMismatches.length > 0) {
    console.log(`\n   Release filename mismatches: ${result.nameMismatches.length}`);
    for (const mismatch of result.nameMismatches) {
      console.log(
        `   - ${mismatch.asset.githubFileName} (${assetLabel(mismatch.asset)}): ` +
          `release asset is ${mismatch.releaseAsset.name}`
      );
    }
  }

  if (result.sizeMismatches.length > 0) {
    console.log(`\n   Size mismatches: ${result.sizeMismatches.length}`);
    for (const mismatch of result.sizeMismatches) {
      console.log(
        `   - ${mismatch.asset.githubFileName} (${assetLabel(mismatch.asset)}): ` +
          `expected ${mismatch.asset.fileSize}, release has ${mismatch.releaseAsset.size}`
      );
    }
  }

  if (result.hashMismatches.length > 0) {
    console.log(`\n   MD5 mismatches: ${result.hashMismatches.length}`);
    for (const mismatch of result.hashMismatches) {
      console.log(
        `   - ${mismatch.asset.githubFileName} (${assetLabel(mismatch.asset)}): ` +
          `expected ${mismatch.asset.fileMd5}, release has ${mismatch.releaseMd5}`
      );
    }
  }
}
