#!/usr/bin/env node
/**
 * Convert GPU driver .zip files to .tzst format and add to custom_components.json
 *
 * Usage:
 *   npm run convert-drivers
 *
 * Place .zip driver files in .tmp_drivers/ directory, then run this script.
 * The script will:
 *   1. Convert each .zip to .tzst format (matching existing driver format)
 *   2. Calculate MD5 hash and file size
 *   3. Add entries to data/custom_components.json
 *   4. Output the .tzst files to .tmp_drivers/ for manual upload to GitHub
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, join } from 'path';

const TMP_DRIVERS_DIR = '.tmp_drivers';
const CUSTOM_COMPONENTS_PATH = 'data/custom_components.json';
const COMPONENT_TYPE_GPU_DRIVER = 2;

interface CustomComponent {
  id: number;
  name: string;
  type: number;
  version: string;
  version_code: number;
  file_name: string;
  file_md5: string;
  file_size: string;
}

interface CustomComponentsFile {
  $schema: string;
  version: string;
  description: string;
  components: CustomComponent[];
}

function findNextId(components: CustomComponent[], xmlPath: string): number {
  // Find highest ID from custom components
  const customMaxId = components.reduce((max, c) => Math.max(max, c.id), 0);

  // Find highest ID from XML
  let xmlMaxId = 0;
  if (existsSync(xmlPath)) {
    const xmlContent = readFileSync(xmlPath, 'utf-8');
    const idMatches = xmlContent.matchAll(/"id":(\d+)/g);
    for (const match of idMatches) {
      xmlMaxId = Math.max(xmlMaxId, parseInt(match[1], 10));
    }
  }

  // Start from 990 for custom drivers to avoid conflicts, or use max + 1 if higher
  const baseId = 990;
  const maxExisting = Math.max(customMaxId, xmlMaxId);

  return maxExisting >= baseId ? maxExisting + 1 : baseId;
}

function getMd5(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('md5').update(content).digest('hex');
}

function getFileSize(filePath: string): string {
  return statSync(filePath).size.toString();
}

function convertZipToTzst(zipPath: string, outputDir: string): string {
  const zipName = basename(zipPath, '.zip');
  const tzstPath = join(outputDir, `${zipName}.tzst`);
  const tempDir = join(outputDir, '.tmp_convert');

  // Create temp directory
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  try {
    // Find the .so file in the zip
    const listOutput = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf-8' });
    const soMatch = listOutput.match(/(\S+\.so)$/m);
    if (!soMatch) {
      throw new Error(`No .so file found in ${zipPath}`);
    }
    const soFileName = soMatch[1];

    // Extract the .so file
    const extractedSo = join(tempDir, 'libvulkan_freedreno.so');
    execSync(`unzip -p "${zipPath}" "${soFileName}" > "${extractedSo}"`, {
      shell: '/bin/bash',
    });

    // Create tar archive
    const tarPath = join(tempDir, `${zipName}.tar`);
    execSync(
      `tar --owner=root --group=root -cf "${tarPath}" -C "${tempDir}" ./libvulkan_freedreno.so`
    );

    // Compress with zstd
    execSync(`zstd -q --rm "${tarPath}" -o "${tzstPath}"`);

    return tzstPath;
  } finally {
    // Cleanup temp files
    try {
      execSync(`rm -rf "${tempDir}"`);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function main() {
  console.log('GPU Driver Converter');
  console.log('====================\n');

  // Check if tmp_drivers directory exists
  if (!existsSync(TMP_DRIVERS_DIR)) {
    console.log(`Creating ${TMP_DRIVERS_DIR}/ directory...`);
    mkdirSync(TMP_DRIVERS_DIR, { recursive: true });
    console.log(`\nPlace your .zip driver files in ${TMP_DRIVERS_DIR}/ and run again.`);
    return;
  }

  // Find all .zip files
  const zipFiles = readdirSync(TMP_DRIVERS_DIR).filter((f) => f.endsWith('.zip'));

  if (zipFiles.length === 0) {
    console.log(`No .zip files found in ${TMP_DRIVERS_DIR}/`);
    console.log(`\nPlace your .zip driver files in ${TMP_DRIVERS_DIR}/ and run again.`);
    return;
  }

  console.log(`Found ${zipFiles.length} .zip file(s):\n`);
  zipFiles.forEach((f) => console.log(`  - ${f}`));
  console.log('');

  // Load custom components
  const customComponentsData: CustomComponentsFile = JSON.parse(
    readFileSync(CUSTOM_COMPONENTS_PATH, 'utf-8')
  );

  // Find starting ID
  let nextId = findNextId(
    customComponentsData.components,
    'data/sp_winemu_all_components12.xml'
  );

  const newComponents: CustomComponent[] = [];
  const createdFiles: string[] = [];

  for (const zipFile of zipFiles) {
    const zipPath = join(TMP_DRIVERS_DIR, zipFile);
    const driverName = basename(zipFile, '.zip');

    console.log(`Converting: ${zipFile}`);

    // Check if already exists in custom components
    const exists = customComponentsData.components.some(
      (c) => c.name === driverName || c.file_name === `${driverName}.tzst`
    );
    if (exists) {
      console.log(`  ⚠ Skipping: "${driverName}" already exists in custom_components.json\n`);
      continue;
    }

    try {
      // Convert to tzst
      const tzstPath = convertZipToTzst(zipPath, TMP_DRIVERS_DIR);
      const md5 = getMd5(tzstPath);
      const fileSize = getFileSize(tzstPath);

      const component: CustomComponent = {
        id: nextId++,
        name: driverName,
        type: COMPONENT_TYPE_GPU_DRIVER,
        version: '1.0.0',
        version_code: 1,
        file_name: `${driverName}.tzst`,
        file_md5: md5,
        file_size: fileSize,
      };

      newComponents.push(component);
      createdFiles.push(basename(tzstPath));

      console.log(`  ✓ Created: ${basename(tzstPath)}`);
      console.log(`    ID: ${component.id}`);
      console.log(`    MD5: ${md5}`);
      console.log(`    Size: ${fileSize} bytes\n`);
    } catch (error) {
      console.error(`  ✗ Error: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  if (newComponents.length === 0) {
    console.log('No new drivers to add.');
    return;
  }

  // Add new components to custom_components.json
  customComponentsData.components.push(...newComponents);

  writeFileSync(CUSTOM_COMPONENTS_PATH, JSON.stringify(customComponentsData, null, 2) + '\n');

  console.log('─'.repeat(50));
  console.log(`\n✓ Added ${newComponents.length} driver(s) to custom_components.json`);
  console.log(`\nCreated .tzst files in ${TMP_DRIVERS_DIR}/:`);
  createdFiles.forEach((f) => console.log(`  - ${f}`));

  console.log(`\nNext steps:`);
  console.log(`  1. Upload to GitHub release:`);
  console.log(
    `     gh release upload Components ${createdFiles.map((f) => `"${TMP_DRIVERS_DIR}/${f}"`).join(' ')} --repo Producdevity/gamehub-lite-api`
  );
  console.log(`\n  2. Run build to verify:`);
  console.log(`     npm run build`);
  console.log(`\n  3. (Optional) Delete the temp files:`);
  console.log(`     rm -rf ${TMP_DRIVERS_DIR}/*`);
}

main();
