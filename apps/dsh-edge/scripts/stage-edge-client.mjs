/** Stage the Edge browser plugin next to the publishable package root. */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDirectory = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = join(appDirectory, '../..')
const sourceBundle = join(appDirectory, 'standalone/edge-client/client.js')
const sourcePackage = join(repoRoot, 'packages/client/ui-edge/package.json')
const outDirectory = join(appDirectory, 'edge-client')

const pkg = JSON.parse(await readFile(sourcePackage, 'utf8'))
await rm(outDirectory, { recursive: true, force: true })
await mkdir(outDirectory, { recursive: true })
await cp(sourceBundle, join(outDirectory, 'client.js'))
await writeFile(
  join(outDirectory, 'package.json'),
  `${JSON.stringify({
    name: pkg.name,
    private: true,
    type: 'module',
    exports: { './client': './client.js' },
    dsh: pkg.dsh,
  }, undefined, 2)}\n`,
)
process.stdout.write('Staged edge-client for publish.\n')
