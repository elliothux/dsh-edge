/** Copy the patched standalone dependency closure into vendor/ for npm publish. */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'

const appDirectory = fileURLToPath(new URL('..', import.meta.url))
const standaloneDirectory = join(appDirectory, 'standalone')
const vendorDirectory = join(appDirectory, 'vendor')
const modulesRoot = join(standaloneDirectory, 'node_modules')
const standalonePackage = JSON.parse(
  await readFile(join(standaloneDirectory, 'package.json'), 'utf8'),
)
const workspaceText = await readFile(join(standaloneDirectory, 'pnpm-workspace.yaml'), 'utf8')

const skip = new Set([
  'execa',
  'jsonc-parser',
  'wrangler',
  'lightningcss',
  'tsdown',
  'tsx',
  'typescript',
  'unrun',
  'compare-versions',
])

/** Package names from `patchedDependencies` keys (`name@version`). */
function patchedPackageNames(text) {
  const names = []
  for (const match of text.matchAll(/^\s+'(@?[^@'\s]+)@[^']+':\s/gm)) {
    names.push(match[1])
  }
  return names
}

await rm(vendorDirectory, { recursive: true, force: true })
await mkdir(vendorDirectory, { recursive: true })

async function packageDirectory(name) {
  const relative = name.startsWith('@')
    ? join(...name.split('/'))
    : name
  const linked = join(modulesRoot, relative)
  return realpathSync(linked)
}

// Direct deps plus every patched package (patches may land only on transitive UI).
const stagedNames = new Set([
  ...Object.keys(standalonePackage.dependencies),
  ...patchedPackageNames(workspaceText),
])

const staged = []
for (const name of [...stagedNames].sort()) {
  if (skip.has(name)) continue
  const source = await packageDirectory(name)
  const destination = join(vendorDirectory, ...name.split('/'))
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, dereference: true })
  staged.push(name)
}

await writeFile(
  join(vendorDirectory, 'manifest.json'),
  `${JSON.stringify({ packages: staged }, undefined, 2)}\n`,
)

const missingPatched = patchedPackageNames(workspaceText).filter((name) => !staged.includes(name))
if (missingPatched.length > 0) {
  throw new Error(`vendor is missing patched packages: ${missingPatched.join(', ')}`)
}

process.stdout.write(`Staged ${staged.length} vendor packages for publish.\n`)
