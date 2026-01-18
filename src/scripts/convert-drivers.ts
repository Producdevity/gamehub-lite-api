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
 *   4. Optionally upload to GitHub, run build, and cleanup
 */

import { execSync, spawnSync } from 'child_process'
import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs'
import { basename, join } from 'path'
import * as readline from 'readline'

const TMP_DRIVERS_DIR = '.tmp_drivers'
const CUSTOM_COMPONENTS_PATH = 'data/custom_components.json'
const GITHUB_REPO = 'Producdevity/gamehub-lite-api'
const COMPONENT_TYPE_GPU_DRIVER = 2

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
}

interface CustomComponent {
  id: number
  name: string
  type: number
  version: string
  version_code: number
  file_name: string
  file_md5: string
  file_size: string
}

interface CustomComponentsFile {
  $schema: string
  version: string
  description: string
  components: CustomComponent[]
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

async function confirm(message: string): Promise<boolean> {
  const answer = await prompt(
    `${colors.cyan}?${colors.reset} ${message} ${colors.dim}(Y/n)${colors.reset} `,
  )
  return answer === '' || answer === 'y' || answer === 'yes'
}

function runCommand(
  command: string,
  description: string,
): { success: boolean; output: string } {
  console.log(`\n${colors.dim}$ ${command}${colors.reset}`)
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    console.log(`${colors.green}✓${colors.reset} ${description}`)
    return { success: true, output }
  } catch (error) {
    const err = error as { stderr?: string; message?: string }
    console.log(`${colors.red}✗${colors.reset} ${description}`)
    console.log(
      `${colors.red}  Error: ${err.stderr || err.message}${colors.reset}`,
    )
    return { success: false, output: err.stderr || err.message || '' }
  }
}

function runCommandInteractive(command: string, description: string): boolean {
  console.log(`\n${colors.dim}$ ${command}${colors.reset}\n`)
  const result = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
  })
  if (result.status === 0) {
    console.log(`\n${colors.green}✓${colors.reset} ${description}`)
    return true
  } else {
    console.log(`\n${colors.red}✗${colors.reset} ${description}`)
    return false
  }
}

function findNextId(components: CustomComponent[], xmlPath: string): number {
  const customMaxId = components.reduce((max, c) => Math.max(max, c.id), 0)

  let xmlMaxId = 0
  if (existsSync(xmlPath)) {
    const xmlContent = readFileSync(xmlPath, 'utf-8')
    const idMatches = xmlContent.matchAll(/"id":(\d+)/g)
    for (const match of idMatches) {
      xmlMaxId = Math.max(xmlMaxId, parseInt(match[1], 10))
    }
  }

  const baseId = 990
  const maxExisting = Math.max(customMaxId, xmlMaxId)
  return maxExisting >= baseId ? maxExisting + 1 : baseId
}

function getMd5(filePath: string): string {
  const content = readFileSync(filePath)
  return createHash('md5').update(content).digest('hex')
}

function getFileSize(filePath: string): string {
  return statSync(filePath).size.toString()
}

function convertZipToTzst(zipPath: string, outputDir: string): string {
  const zipName = basename(zipPath, '.zip')
  const tzstPath = join(outputDir, `${zipName}.tzst`)
  const tempDir = join(outputDir, '.tmp_convert')

  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }

  try {
    const listOutput = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf-8' })
    const soMatch = listOutput.match(/(\S+\.so)$/m)
    if (!soMatch) {
      throw new Error(`No .so file found in ${zipPath}`)
    }
    const soFileName = soMatch[1]

    const extractedSo = join(tempDir, 'libvulkan_freedreno.so')
    execSync(`unzip -p "${zipPath}" "${soFileName}" > "${extractedSo}"`, {
      shell: '/bin/bash',
    })

    const tarPath = join(tempDir, `${zipName}.tar`)
    execSync(
      `tar --owner=root --group=root -cf "${tarPath}" -C "${tempDir}" ./libvulkan_freedreno.so`,
    )

    execSync(`zstd -q --rm "${tarPath}" -o "${tzstPath}"`)

    return tzstPath
  } finally {
    try {
      execSync(`rm -rf "${tempDir}"`)
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function main() {
  console.log(
    `\n${colors.bold}${colors.blue}GPU Driver Converter${colors.reset}`,
  )
  console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}\n`)

  // Check if tmp_drivers directory exists
  if (!existsSync(TMP_DRIVERS_DIR)) {
    console.log(`Creating ${TMP_DRIVERS_DIR}/ directory...`)
    mkdirSync(TMP_DRIVERS_DIR, { recursive: true })
    console.log(
      `\n${colors.yellow}Place your .zip driver files in ${TMP_DRIVERS_DIR}/ and run again.${colors.reset}`,
    )
    return
  }

  // Find all .zip files
  const zipFiles = readdirSync(TMP_DRIVERS_DIR).filter((f) =>
    f.endsWith('.zip'),
  )

  if (zipFiles.length === 0) {
    console.log(`${colors.yellow}No .zip files found in ${TMP_DRIVERS_DIR}/${colors.reset}`)
    console.log(
      `\nPlace your .zip driver files in ${TMP_DRIVERS_DIR}/ and run again.`,
    )
    return
  }

  console.log(`Found ${colors.bold}${zipFiles.length}${colors.reset} .zip file(s):\n`)
  zipFiles.forEach((f) => console.log(`  ${colors.dim}•${colors.reset} ${f}`))
  console.log('')

  // Load custom components
  const customComponentsData: CustomComponentsFile = JSON.parse(
    readFileSync(CUSTOM_COMPONENTS_PATH, 'utf-8'),
  )

  let nextId = findNextId(
    customComponentsData.components,
    'data/sp_winemu_all_components12.xml',
  )

  const newComponents: CustomComponent[] = []
  const createdFiles: string[] = []

  for (const zipFile of zipFiles) {
    const zipPath = join(TMP_DRIVERS_DIR, zipFile)
    const driverName = basename(zipFile, '.zip')

    console.log(`${colors.blue}Converting:${colors.reset} ${zipFile}`)

    const exists = customComponentsData.components.some(
      (c) => c.name === driverName || c.file_name === `${driverName}.tzst`,
    )
    if (exists) {
      console.log(
        `  ${colors.yellow}⚠ Skipping:${colors.reset} "${driverName}" already exists\n`,
      )
      continue
    }

    try {
      const tzstPath = convertZipToTzst(zipPath, TMP_DRIVERS_DIR)
      const md5 = getMd5(tzstPath)
      const fileSize = getFileSize(tzstPath)

      const component: CustomComponent = {
        id: nextId++,
        name: driverName,
        type: COMPONENT_TYPE_GPU_DRIVER,
        version: '1.0.0',
        version_code: 1,
        file_name: `${driverName}.tzst`,
        file_md5: md5,
        file_size: fileSize,
      }

      newComponents.push(component)
      createdFiles.push(basename(tzstPath))

      console.log(`  ${colors.green}✓${colors.reset} Created: ${basename(tzstPath)}`)
      console.log(`    ${colors.dim}ID: ${component.id} | MD5: ${md5.slice(0, 8)}... | Size: ${(parseInt(fileSize) / 1024 / 1024).toFixed(2)} MB${colors.reset}\n`)
    } catch (error) {
      console.error(
        `  ${colors.red}✗ Error:${colors.reset} ${error instanceof Error ? error.message : error}\n`,
      )
    }
  }

  if (newComponents.length === 0) {
    console.log(`${colors.yellow}No new drivers to add.${colors.reset}`)
    return
  }

  // Add new components to custom_components.json
  customComponentsData.components.push(...newComponents)
  writeFileSync(
    CUSTOM_COMPONENTS_PATH,
    JSON.stringify(customComponentsData, null, 2) + '\n',
  )

  console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}`)
  console.log(
    `\n${colors.green}✓${colors.reset} Added ${colors.bold}${newComponents.length}${colors.reset} driver(s) to custom_components.json`,
  )
  console.log(`\n${colors.bold}Created files:${colors.reset}`)
  createdFiles.forEach((f) => console.log(`  ${colors.dim}•${colors.reset} ${TMP_DRIVERS_DIR}/${f}`))

  // Interactive next steps
  console.log(`\n${colors.dim}${'─'.repeat(40)}${colors.reset}`)
  console.log(`${colors.bold}${colors.blue}Next Steps${colors.reset}\n`)

  // Step 1: Upload to GitHub
  const uploadCmd = `gh release upload Components ${createdFiles.map((f) => `"${TMP_DRIVERS_DIR}/${f}"`).join(' ')} --repo ${GITHUB_REPO} --clobber`

  if (await confirm('Upload drivers to GitHub release?')) {
    runCommand(uploadCmd, 'Uploaded to GitHub release')
  } else {
    console.log(`\n${colors.dim}Skipped. Run manually:${colors.reset}`)
    console.log(`  ${colors.cyan}${uploadCmd}${colors.reset}`)
  }

  // Step 2: Run build
  if (await confirm('Run build to verify?')) {
    runCommandInteractive('npm run build', 'Build completed')
  } else {
    console.log(`\n${colors.dim}Skipped. Run manually:${colors.reset}`)
    console.log(`  ${colors.cyan}npm run build${colors.reset}`)
  }

  // Step 3: Cleanup
  if (await confirm('Delete temp files (.tmp_drivers/*)?')) {
    runCommand(`rm -rf ${TMP_DRIVERS_DIR}/*`, 'Cleaned up temp files')
  } else {
    console.log(`\n${colors.dim}Skipped. Run manually:${colors.reset}`)
    console.log(`  ${colors.cyan}rm -rf ${TMP_DRIVERS_DIR}/*${colors.reset}`)
  }

  console.log(`\n${colors.green}${colors.bold}Done!${colors.reset}\n`)
}

main().catch(console.error)
