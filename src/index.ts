import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

import { parseXmlFile } from './parsers/xml-parser.js';
import { parseCustomComponents } from './parsers/custom-parser.js';
import { checkReleaseAssets, printReleaseAssetFailures } from './release/release-check.js';
import { ComponentRegistry } from './registry/registry.js';
import {
  generateAllManifests,
  generateIndex,
  generateDownloads,
  generateAllComponentList,
  generateComponentList,
  generateContainerList,
  generateDefaultComponent,
  generateImagefsDetail,
  generateExecuteScript,
} from './generators/index.js';
import { formatJson } from './utils/json.js';
import type { BuildConfig, Container, Imagefs, Defaults, ExecutionConfig } from './types/index.js';
import { DEFAULT_CONFIG } from './types/index.js';

/**
 * Load JSON file
 */
function loadJson<T>(path: string): T {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Write an output file
 */
function writeOutput(basePath: string, relativePath: string, data: unknown): void {
  const fullPath = join(basePath, relativePath);
  const dir = dirname(fullPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(fullPath, formatJson(data));
  console.log(`  ✓ ${relativePath}`);
}

/**
 * Build all output files
 */
async function build(config: BuildConfig): Promise<void> {
  console.log('GameHub Lite API Build System');
  console.log('=============================\n');

  console.log('1. Parsing XML source...');
  const xmlComponents = parseXmlFile(config.xmlSource);
  console.log(`   Found ${xmlComponents.length} components from XML`);

  console.log('2. Loading custom components...');
  const customComponents = parseCustomComponents(config.customComponentsFile, config);
  console.log(`   Found ${customComponents.length} custom components\n`);

  const components = [...xmlComponents, ...customComponents];
  console.log(`   Total: ${components.length} components\n`);

  console.log('3. Building registry...');
  const registry = new ComponentRegistry(config);
  registry.addComponents(components);

  console.log('4. Loading static data...');
  registry.containers = loadJson<Container[]>(config.containersFile);
  console.log(`   Loaded ${registry.containers.length} containers`);

  registry.imagefs = loadJson<Imagefs>(config.imagefsFile);
  console.log(`   Loaded imagefs`);

  registry.defaults = loadJson<Defaults>(config.defaultsFile);
  console.log(`   Loaded defaults`);

  registry.executionConfig = loadJson<ExecutionConfig>(config.executionConfigFile);
  console.log(`   Loaded execution config\n`);

  console.log('5. Validating...');
  const validation = registry.validate();
  if (!validation.valid) {
    console.error('   Validation errors:');
    for (const error of validation.errors) {
      console.error(`   - ${error}`);
    }
    process.exit(1);
  }
  console.log('   ✓ All validations passed\n');

  const timestamp = config.timestamp || String(Math.floor(Date.now() / 1000));

  console.log('6. Generating output files...');

  const manifests = generateAllManifests(registry);
  for (const [name, data] of manifests) {
    writeOutput(config.outputDir, `components/${name}`, data);
  }

  writeOutput(config.outputDir, 'components/index', generateIndex(registry));

  writeOutput(config.outputDir, 'components/downloads', generateDownloads(registry));

  writeOutput(
    config.outputDir,
    'simulator/v2/getAllComponentList',
    generateAllComponentList(registry, timestamp)
  );

  writeOutput(
    config.outputDir,
    'simulator/v2/getComponentList',
    generateComponentList(registry, timestamp)
  );

  writeOutput(
    config.outputDir,
    'simulator/v2/getContainerList',
    generateContainerList(registry, timestamp)
  );

  writeOutput(
    config.outputDir,
    'simulator/v2/getDefaultComponent',
    generateDefaultComponent(registry, timestamp)
  );

  writeOutput(
    config.outputDir,
    'simulator/v2/getImagefsDetail',
    generateImagefsDetail(registry, timestamp)
  );

  writeOutput(
    config.outputDir,
    'simulator/executeScript/generic',
    generateExecuteScript(registry, 'generic', timestamp)
  );

  writeOutput(
    config.outputDir,
    'simulator/executeScript/qualcomm',
    generateExecuteScript(registry, 'qualcomm', timestamp)
  );

  console.log('\n✓ Build complete!\n');

  const counts = registry.getCountsByType();
  console.log('Summary:');
  console.log(`  Total components: ${registry.getTotalCount()}`);
  console.log(`  - Type 1 (Box64/FEX): ${counts[1]}`);
  console.log(`  - Type 2 (GPU Drivers): ${counts[2]}`);
  console.log(`  - Type 3 (DXVK): ${counts[3]}`);
  console.log(`  - Type 4 (VKD3D): ${counts[4]}`);
  console.log(`  - Type 5 (Games): ${counts[5]}`);
  console.log(`  - Type 6 (Libraries): ${counts[6]}`);
  console.log(`  - Type 7 (Steam): ${counts[7]}`);
  console.log(`  Containers: ${registry.containers.length}`);

  console.log('\n7. Checking GitHub release assets...');
  const releaseCheck = checkReleaseAssets(registry, config);
  const issueCount =
    releaseCheck.missing.length +
    releaseCheck.invalidAssets.length +
    releaseCheck.metadataConflicts.length +
    releaseCheck.nameMismatches.length +
    releaseCheck.sizeMismatches.length +
    releaseCheck.hashMismatches.length;

  if (issueCount === 0) {
    console.log(`   ✓ All ${releaseCheck.total} release assets exist and match metadata\n`);
    if (releaseCheck.verified > 0) {
      console.log(`   Verified ${releaseCheck.verified} release asset MD5s`);
    }
  } else {
    console.log(`\n   RELEASE ASSET ERRORS: ${issueCount}\n`);
    printReleaseAssetFailures(releaseCheck);
    console.log('\n   Fix the listed release asset errors, then run npm run build again.\n');

    console.error('   ❌ Build failed: GitHub release assets do not match component metadata');
    process.exit(1);
  }
}

/**
 * Validate current data without generating
 */
async function validate(config: BuildConfig): Promise<void> {
  console.log('Validating data...\n');

  const components = parseXmlFile(config.xmlSource);
  const registry = new ComponentRegistry(config);
  registry.addComponents(components);

  registry.containers = loadJson<Container[]>(config.containersFile);
  registry.imagefs = loadJson<Imagefs>(config.imagefsFile);
  registry.defaults = loadJson<Defaults>(config.defaultsFile);
  registry.executionConfig = loadJson<ExecutionConfig>(config.executionConfigFile);

  const validation = registry.validate();

  if (validation.valid) {
    console.log('✓ All validations passed');
  } else {
    console.error('Validation errors:');
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'build';

  const config = DEFAULT_CONFIG;

  switch (command) {
    case 'build':
      await build(config);
      break;
    case 'validate':
      await validate(config);
      break;
    case 'sync':
      console.log('Sync command not yet implemented');
      break;
    case 'diff':
      console.log('Diff command not yet implemented');
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Available commands: build, validate, sync, diff');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
