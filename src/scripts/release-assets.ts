#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, join } from 'path';

import { parseCustomComponents } from '../parsers/custom-parser.js';
import { parseXmlFile } from '../parsers/xml-parser.js';
import { collectExpectedAssets, type ExpectedReleaseAsset } from '../release/release-check.js';
import { ComponentRegistry } from '../registry/registry.js';
import { DEFAULT_CONFIG, type Container, type Imagefs } from '../types/index.js';
import { toGitHubAssetKey } from '../utils/github-assets.js';
import { formatJson } from '../utils/json.js';

const DEFAULT_DOWNLOAD_DIR = join(DEFAULT_CONFIG.downloadDir, 'gamehub-xml');
const DEFAULT_EXISTING_DIR = join(DEFAULT_CONFIG.downloadDir, 'release-existing');

type Command = 'check' | 'upload-new' | 'replace-changed' | 'repair';
type AssetStatus = 'new' | 'same' | 'changed' | 'unknown';

interface ManifestAsset {
  kind: string;
  id: number;
  name: string;
  assetName: string;
  originalFileName: string;
  downloadUrl: string;
  fileMd5: string;
  fileSize: string | null;
  reasons: string[];
}

interface AssetManifest {
  total: number;
  assets: ManifestAsset[];
}

interface ReleaseInfo {
  id: number;
}

interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  state?: string;
  digest?: string | null;
  browser_download_url?: string;
}

interface ParsedArgs {
  command: Command;
  downloadExisting: boolean;
  dryRun: boolean;
  downloadDir: string;
  existingDir: string;
  repo: string;
  release: string;
}

interface ComparedAsset {
  manifest: ManifestAsset;
  localPath: string;
  localSize: number;
  localMd5: string;
  localSha256: string;
  releaseAsset: ReleaseAsset | null;
  releaseSha256: string | null;
  status: AssetStatus;
  reason: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const command = (args.shift() ?? 'check') as Command;
  if (!['check', 'upload-new', 'replace-changed', 'repair'].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  let downloadExisting = command === 'replace-changed';
  let dryRun = false;
  let downloadDir = DEFAULT_DOWNLOAD_DIR;
  let existingDir = DEFAULT_EXISTING_DIR;
  let repo = DEFAULT_CONFIG.githubRepo;
  let release = DEFAULT_CONFIG.githubRelease;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--download-existing') {
      downloadExisting = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--download-dir') {
      downloadDir = args[++i] ?? '';
      if (!downloadDir) throw new Error('--download-dir requires a path');
    } else if (arg.startsWith('--download-dir=')) {
      downloadDir = arg.slice('--download-dir='.length);
    } else if (arg === '--existing-dir') {
      existingDir = args[++i] ?? '';
      if (!existingDir) throw new Error('--existing-dir requires a path');
    } else if (arg.startsWith('--existing-dir=')) {
      existingDir = arg.slice('--existing-dir='.length);
    } else if (arg === '--repo') {
      repo = args[++i] ?? '';
      if (!repo) throw new Error('--repo requires owner/name');
    } else if (arg.startsWith('--repo=')) {
      repo = arg.slice('--repo='.length);
    } else if (arg === '--release') {
      release = args[++i] ?? '';
      if (!release) throw new Error('--release requires a release tag');
    } else if (arg.startsWith('--release=')) {
      release = arg.slice('--release='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { command, downloadExisting, dryRun, downloadDir, existingDir, repo, release };
}

function readManifest(downloadDir: string): AssetManifest {
  const manifestPath = join(downloadDir, 'asset-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Missing ${manifestPath}. Run "npm run import-gamehub-xml -- --download-assets" first.`
    );
  }

  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as AssetManifest;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function loadRegistry(): ComponentRegistry {
  const xmlComponents = parseXmlFile(DEFAULT_CONFIG.xmlSource);
  const customComponents = parseCustomComponents(DEFAULT_CONFIG.customComponentsFile, DEFAULT_CONFIG);
  const registry = new ComponentRegistry(DEFAULT_CONFIG);
  registry.addComponents([...xmlComponents, ...customComponents]);
  registry.containers = loadJson<Container[]>(DEFAULT_CONFIG.containersFile);
  registry.imagefs = loadJson<Imagefs>(DEFAULT_CONFIG.imagefsFile);
  return registry;
}

function assetManifestFromLocalRegistry(downloadDir: string): AssetManifest {
  if (!existsSync(downloadDir)) {
    throw new Error(`Missing ${downloadDir}. Run "npm run import-gamehub-xml -- --download-assets" first.`);
  }

  const localNames = new Set<string>(readdirSync(downloadDir));
  const expectedAssets: ExpectedReleaseAsset[] = collectExpectedAssets(loadRegistry());
  const assets = expectedAssets
    .filter((asset: ExpectedReleaseAsset) => localNames.has(asset.githubFileName))
    .map((asset: ExpectedReleaseAsset) => manifestAssetFromExpected(asset));

  return { total: assets.length, assets };
}

function manifestAssetFromExpected(asset: ExpectedReleaseAsset): ManifestAsset {
  return {
    kind: asset.kind,
    id: asset.id,
    name: asset.name,
    assetName: asset.githubFileName,
    originalFileName: asset.githubFileName,
    downloadUrl: '',
    fileMd5: asset.fileMd5,
    fileSize: asset.fileSize,
    reasons: ['local registry repair'],
  };
}

function hashFile(path: string, algorithm: 'md5' | 'sha256'): string {
  return createHash(algorithm).update(readFileSync(path)).digest('hex');
}

function verifyLocalAsset(asset: ManifestAsset, downloadDir: string): ComparedAsset {
  const localPath = join(downloadDir, asset.assetName);
  if (!existsSync(localPath)) {
    throw new Error(`${asset.assetName}: local file is missing from ${downloadDir}`);
  }

  const localSize = statSync(localPath).size;
  const localMd5 = hashFile(localPath, 'md5');
  if (localMd5.toLowerCase() !== asset.fileMd5.toLowerCase()) {
    throw new Error(`${asset.assetName}: local MD5 mismatch`);
  }

  if (asset.fileSize && localSize !== Number(asset.fileSize)) {
    throw new Error(`${asset.assetName}: local size mismatch`);
  }

  return {
    manifest: asset,
    localPath,
    localSize,
    localMd5,
    localSha256: hashFile(localPath, 'sha256'),
    releaseAsset: null,
    releaseSha256: null,
    status: 'unknown',
    reason: 'not compared',
  };
}

function runJson<T>(args: string[], description: string): T {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: '1',
    CLICOLOR: '0',
    FORCE_COLOR: '0',
    TERM: 'dumb',
  };
  delete env.GH_FORCE_TTY;
  delete env.CLICOLOR_FORCE;

  const result = spawnSync('gh', args, {
    encoding: 'utf-8',
    env,
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.status !== 0 || result.error) {
    const detail = result.stderr.trim() || result.error?.message || 'unknown error';
    throw new Error(`${description} failed: ${detail}`);
  }

  return JSON.parse(stripAnsi(result.stdout)) as T;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function fetchReleaseInfo(repo: string, release: string): ReleaseInfo {
  return runJson<ReleaseInfo>(
    ['api', `repos/${repo}/releases/tags/${release}`],
    'Fetching release info'
  );
}

function fetchReleaseAssets(repo: string, release: string): Map<string, ReleaseAsset> {
  const releaseInfo = fetchReleaseInfo(repo, release);
  const assets = new Map<string, ReleaseAsset>();
  const pages = runJson<ReleaseAsset[][]>(
    ['api', '--paginate', '--slurp', `repos/${repo}/releases/${releaseInfo.id}/assets?per_page=100`],
    'Fetching release assets'
  );

  for (const pageAssets of pages) {
    for (const asset of pageAssets) {
      assets.set(toGitHubAssetKey(asset.name), asset);
    }
  }

  return assets;
}

function sha256FromDigest(digest: string | null | undefined): string | null {
  if (!digest) return null;
  const match = /^(?:sha256:)?([a-f0-9]{64})$/i.exec(digest);
  return match ? match[1]!.toLowerCase() : null;
}

function downloadExistingReleaseAsset(asset: ReleaseAsset, existingDir: string): string {
  if (!asset.browser_download_url) {
    throw new Error(`${asset.name}: release asset has no download URL`);
  }

  mkdirSync(existingDir, { recursive: true });
  const outputPath = join(existingDir, asset.name);

  if (existsSync(outputPath) && statSync(outputPath).size === asset.size) {
    return outputPath;
  }

  if (existsSync(outputPath)) {
    unlinkSync(outputPath);
  }

  const partialPath = `${outputPath}.partial`;
  if (existsSync(partialPath)) {
    unlinkSync(partialPath);
  }

  console.log(`  Downloading existing release asset for comparison: ${asset.name}`);
  const result = spawnSync(
    'curl',
    [
      '-L',
      '--fail',
      '--retry',
      '3',
      '--connect-timeout',
      '30',
      '-o',
      partialPath,
      asset.browser_download_url,
    ],
    { stdio: 'inherit' }
  );

  if (result.status !== 0 || result.error) {
    throw new Error(`${asset.name}: failed to download existing release asset`);
  }

  renameSync(partialPath, outputPath);
  return outputPath;
}

function compareAssets(args: ParsedArgs): { assets: ComparedAsset[]; releaseTotal: number } {
  return compareManifestAssets(args, readManifest(args.downloadDir));
}

function compareLocalRegistryAssets(args: ParsedArgs): { assets: ComparedAsset[]; releaseTotal: number } {
  return compareManifestAssets(args, assetManifestFromLocalRegistry(args.downloadDir));
}

function compareManifestAssets(
  args: ParsedArgs,
  manifest: AssetManifest
): { assets: ComparedAsset[]; releaseTotal: number } {
  const localAssets = manifest.assets.map((asset: ManifestAsset) =>
    verifyLocalAsset(asset, args.downloadDir)
  );
  const releaseAssets = fetchReleaseAssets(args.repo, args.release);

  for (const local of localAssets) {
    const releaseAsset = releaseAssets.get(toGitHubAssetKey(local.manifest.assetName));
    local.releaseAsset = releaseAsset ?? null;

    if (!releaseAsset) {
      local.status = 'new';
      local.reason = 'not present on release';
      continue;
    }

    if (releaseAsset.state && releaseAsset.state !== 'uploaded') {
      local.status = 'changed';
      local.reason = `release asset is ${releaseAsset.state}`;
      continue;
    }

    if (releaseAsset.name !== local.manifest.assetName) {
      local.status = 'changed';
      local.reason = `release filename differs: ${releaseAsset.name}`;
      continue;
    }

    const digestSha256 = sha256FromDigest(releaseAsset.digest);
    if (digestSha256) {
      local.releaseSha256 = digestSha256;
      local.status = digestSha256 === local.localSha256 ? 'same' : 'changed';
      local.reason = digestSha256 === local.localSha256 ? 'sha256 matches' : 'sha256 differs';
      continue;
    }

    if (releaseAsset.size !== local.localSize) {
      local.status = 'changed';
      local.reason = 'size differs';
      continue;
    }

    if (args.downloadExisting) {
      const existingPath = downloadExistingReleaseAsset(releaseAsset, args.existingDir);
      const existingSha256 = hashFile(existingPath, 'sha256');
      local.releaseSha256 = existingSha256;
      local.status = existingSha256 === local.localSha256 ? 'same' : 'changed';
      local.reason = existingSha256 === local.localSha256 ? 'downloaded file matches' : 'downloaded file differs';
      continue;
    }

    local.status = 'unknown';
    local.reason = 'release hash unavailable';
  }

  return {
    assets: localAssets.sort((a: ComparedAsset, b: ComparedAsset) =>
      a.manifest.assetName.localeCompare(b.manifest.assetName)
    ),
    releaseTotal: releaseAssets.size,
  };
}

function summarize(assets: ComparedAsset[], releaseTotal: number): void {
  const byStatus = (status: AssetStatus): ComparedAsset[] =>
    assets.filter((asset: ComparedAsset) => asset.status === status);
  const newAssets = byStatus('new');
  const sameAssets = byStatus('same');
  const changedAssets = byStatus('changed');
  const unknownAssets = byStatus('unknown');

  console.log(`Local verified assets: ${assets.length}`);
  console.log(`Release assets: ${releaseTotal}`);
  console.log(`New assets: ${newAssets.length}`);
  console.log(`Already same: ${sameAssets.length}`);
  console.log(`Changed same-name assets: ${changedAssets.length}`);
  console.log(`Unknown same-name assets: ${unknownAssets.length}`);

  if (newAssets.length > 0) {
    console.log('\nNew assets:');
    for (const asset of newAssets) {
      console.log(`  ${asset.manifest.assetName}`);
    }
  }

  if (changedAssets.length > 0) {
    console.log('\nChanged same-name assets:');
    for (const asset of changedAssets) {
      console.log(`  ${asset.manifest.assetName} (${asset.reason})`);
    }
  }

  if (unknownAssets.length > 0) {
    console.log('\nUnknown same-name assets:');
    for (const asset of unknownAssets) {
      console.log(`  ${asset.manifest.assetName} (${asset.reason})`);
    }
    console.log('\nNext: npm run release-assets:check-deep');
  }
}

function writeReport(args: ParsedArgs, assets: ComparedAsset[]): void {
  const reportPath = join(args.downloadDir, 'release-asset-check.json');
  writeFileSync(
    reportPath,
    `${formatJson({
      repo: args.repo,
      release: args.release,
      generatedAt: new Date().toISOString(),
      assets: assets.map((asset: ComparedAsset) => ({
        name: asset.manifest.assetName,
        kind: asset.manifest.kind,
        status: asset.status,
        reason: asset.reason,
        localSize: asset.localSize,
        releaseSize: asset.releaseAsset?.size ?? null,
        localMd5: asset.localMd5,
        localSha256: asset.localSha256,
        releaseSha256: asset.releaseSha256,
      })),
    })}\n`
  );
  console.log(`\nReport: ${reportPath}`);
}

function uploadAssets(args: ParsedArgs, assets: ComparedAsset[], clobber: boolean): void {
  if (assets.length === 0) {
    console.log('No assets to upload.');
    return;
  }

  uploadFilePaths(
    args,
    assets.map((asset: ComparedAsset) => asset.localPath),
    clobber
  );
}

function uploadFilePaths(args: ParsedArgs, filePaths: string[], clobber: boolean): void {
  if (filePaths.length === 0) {
    console.log('No assets to upload.');
    return;
  }

  assertUniqueUploadNames(filePaths);
  const releaseAssets = clobber ? fetchReleaseAssets(args.repo, args.release) : null;

  for (const filePath of filePaths) {
    const fileName = basename(filePath);
    const assetKey = toGitHubAssetKey(fileName);
    const existingAsset = releaseAssets?.get(assetKey);

    if (
      clobber &&
      existingAsset &&
      (existingAsset.name !== fileName || existingAsset.state === 'starter')
    ) {
      if (args.dryRun) {
        console.log(
          `Would delete existing release asset ${existingAsset.name}` +
            `${existingAsset.state ? ` (${existingAsset.state})` : ''}` +
            ` before uploading ${fileName}`
        );
      } else {
        deleteReleaseAsset(args, existingAsset, fileName);
        releaseAssets?.delete(assetKey);
      }
    }

    const ghArgs = ['release', 'upload', args.release, filePath, '--repo', args.repo];
    if (clobber) {
      ghArgs.push('--clobber');
    }

    if (args.dryRun) {
      const mode = clobber ? 'with --clobber' : 'without --clobber';
      console.log(`Would upload ${filePath} ${mode}`);
      continue;
    }

    console.log(`Uploading ${filePath}`);
    const result = spawnSync('gh', ghArgs, {
      encoding: 'utf-8',
      stdio: ['inherit', 'inherit', 'pipe'],
    });

    if (result.status === 0 && !result.error) {
      continue;
    }

    const stderr = result.stderr.trim();
    if (!clobber && /already exists|ReleaseAsset\.name already exists/i.test(stderr)) {
      console.log(`Skipped existing release asset: ${filePath}`);
      continue;
    }

    if (stderr) {
      console.error(stderr);
    }
    throw new Error(result.error?.message ?? `gh release upload failed for ${filePath}`);
  }
}

function assertUniqueUploadNames(filePaths: string[]): void {
  const seen = new Map<string, string>();

  for (const filePath of filePaths) {
    const fileName = basename(filePath);
    const key = toGitHubAssetKey(fileName);
    const existing = seen.get(key);
    if (existing) {
      throw new Error(
        `Refusing to upload both ${existing} and ${filePath}; they resolve to the same release asset name`
      );
    }
    seen.set(key, filePath);
  }
}

function deleteReleaseAsset(args: ParsedArgs, asset: ReleaseAsset, replacementName: string): void {
  console.log(
    `Deleting existing release asset ${asset.name}` +
      `${asset.state ? ` (${asset.state})` : ''}` +
      ` before uploading ${replacementName}`
  );

  const result = spawnSync(
    'gh',
    ['api', '-X', 'DELETE', `repos/${args.repo}/releases/assets/${asset.id}`],
    {
      encoding: 'utf-8',
      stdio: ['inherit', 'inherit', 'pipe'],
    }
  );

  if (result.status !== 0 || result.error) {
    const stderr = result.stderr.trim();
    if (stderr) {
      console.error(stderr);
    }
    throw new Error(result.error?.message ?? `failed to delete release asset ${asset.name}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log(`Release asset command: ${args.command}`);
  console.log(`Release: ${args.repo} ${args.release}`);
  console.log(`Local assets: ${args.downloadDir}\n`);

  const { assets: compared, releaseTotal } =
    args.command === 'repair' ? compareLocalRegistryAssets(args) : compareAssets(args);
  summarize(compared, releaseTotal);
  writeReport(args, compared);

  if (args.command === 'upload-new') {
    uploadAssets(
      args,
      compared.filter((asset: ComparedAsset) => asset.status === 'new'),
      false
    );
  } else if (args.command === 'replace-changed') {
    uploadAssets(
      args,
      compared.filter((asset: ComparedAsset) => asset.status === 'changed'),
      true
    );
  } else if (args.command === 'repair') {
    uploadAssets(
      args,
      compared.filter((asset: ComparedAsset) => asset.status === 'new'),
      false
    );
    uploadAssets(
      args,
      compared.filter((asset: ComparedAsset) => asset.status === 'changed'),
      true
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
