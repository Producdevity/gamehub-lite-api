import { execFileSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { ComponentRegistry, OriginalComponentInfo } from '../registry/registry.js';
import type { BuildConfig } from '../types/index.js';
import { toGitHubAssetKey } from '../utils/github-assets.js';
import { formatJson } from '../utils/json.js';

interface GitHubReleaseAsset {
  name: string;
  size: number;
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

interface MetadataConflict {
  githubFileName: string;
  groups: Array<{
    fileMd5: string;
    fileSize: string;
    components: OriginalComponentInfo[];
  }>;
}

interface ReleaseSizeMismatch {
  info: OriginalComponentInfo;
  releaseAsset: GitHubReleaseAsset;
}

interface ReleaseHashMismatch {
  info: OriginalComponentInfo;
  releaseAsset: GitHubReleaseAsset;
  releaseMd5: string;
}

export interface ReleaseAssetCheckResult {
  total: number;
  verified: number;
  missing: OriginalComponentInfo[];
  metadataConflicts: MetadataConflict[];
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
  const allInfo = registry.getAllOriginalInfo();
  const byAssetKey = new Map<string, OriginalComponentInfo[]>();

  for (const info of allInfo) {
    const key = toGitHubAssetKey(info.githubFileName);
    const infos = byAssetKey.get(key) ?? [];
    infos.push(info);
    byAssetKey.set(key, infos);
  }

  const missing: OriginalComponentInfo[] = [];
  const metadataConflicts: MetadataConflict[] = [];
  const sizeMismatches: ReleaseSizeMismatch[] = [];
  const hashMismatches: ReleaseHashMismatch[] = [];
  const hashQueue: Array<{ info: OriginalComponentInfo; releaseAsset: GitHubReleaseAsset }> = [];

  for (const [assetKey, infos] of byAssetKey) {
    const releaseAsset = releaseAssets.get(assetKey);
    if (!releaseAsset) {
      missing.push(...infos);
      continue;
    }

    const expectedGroups = new Map<string, OriginalComponentInfo[]>();
    for (const info of infos) {
      const key = `${info.fileMd5}:${info.fileSize}`;
      const group = expectedGroups.get(key) ?? [];
      group.push(info);
      expectedGroups.set(key, group);
    }

    if (expectedGroups.size > 1) {
      metadataConflicts.push({
        githubFileName: infos[0]!.githubFileName,
        groups: Array.from(expectedGroups.entries()).map(([key, components]) => {
          const [fileMd5, fileSize] = key.split(':');
          return { fileMd5: fileMd5!, fileSize: fileSize!, components };
        }),
      });
      continue;
    }

    const info = infos[0]!;
    const expectedSize = Number(info.fileSize);
    if (Number.isFinite(expectedSize) && releaseAsset.size !== expectedSize) {
      sizeMismatches.push({ info, releaseAsset });
      continue;
    }

    hashQueue.push({ info, releaseAsset });
  }

  const canHash =
    missing.length === 0 && metadataConflicts.length === 0 && sizeMismatches.length === 0;
  let verified = 0;

  if (canHash) {
    const cachePath = join(config.downloadDir, 'release-md5-cache.json');
    const cache = readReleaseMd5Cache(cachePath);

    for (const item of hashQueue) {
      const releaseMd5 = getReleaseAssetMd5(item.releaseAsset, cachePath, cache);
      verified++;
      if (releaseMd5.toLowerCase() !== item.info.fileMd5.toLowerCase()) {
        hashMismatches.push({ ...item, releaseMd5 });
      }
    }
  }

  return {
    total: allInfo.length,
    verified,
    missing,
    metadataConflicts,
    sizeMismatches,
    hashMismatches,
  };
}

export function printReleaseAssetFailures(result: ReleaseAssetCheckResult): void {
  if (result.missing.length > 0) {
    console.log(`\n   Missing files: ${result.missing.length}`);
    for (const info of result.missing) {
      console.log(`   - ${info.githubFileName} (${info.name}, ID: ${info.id})`);
    }
  }

  if (result.metadataConflicts.length > 0) {
    console.log(`\n   Conflicting component metadata: ${result.metadataConflicts.length}`);
    for (const conflict of result.metadataConflicts) {
      console.log(`   - ${conflict.githubFileName}`);
      for (const group of conflict.groups) {
        const components = group.components.map((info) => `${info.name} ID ${info.id}`).join(', ');
        console.log(`     ${group.fileMd5} size ${group.fileSize}: ${components}`);
      }
    }
  }

  if (result.sizeMismatches.length > 0) {
    console.log(`\n   Size mismatches: ${result.sizeMismatches.length}`);
    for (const mismatch of result.sizeMismatches) {
      console.log(
        `   - ${mismatch.info.githubFileName} (${mismatch.info.name}, ID ${mismatch.info.id}): ` +
          `expected ${mismatch.info.fileSize}, release has ${mismatch.releaseAsset.size}`
      );
    }
  }

  if (result.hashMismatches.length > 0) {
    console.log(`\n   MD5 mismatches: ${result.hashMismatches.length}`);
    for (const mismatch of result.hashMismatches) {
      console.log(
        `   - ${mismatch.info.githubFileName} (${mismatch.info.name}, ID ${mismatch.info.id}): ` +
          `expected ${mismatch.info.fileMd5}, release has ${mismatch.releaseMd5}`
      );
    }
  }
}
