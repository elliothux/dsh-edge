/** Programmatic Worker and Web builds for embedding hosts such as LynxOS. */

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { parse, printParseErrorCode } from 'jsonc-parser'

const appDirectory = fileURLToPath(new URL('..', import.meta.url))
const standaloneDirectory = join(appDirectory, 'standalone')
const packageRequire = createRequire(join(appDirectory, 'package.json'))
const standaloneRequire = createRequire(join(standaloneDirectory, 'package.json'))

function resolveRequire() {
  try {
    standaloneRequire.resolve('wrangler')
    return standaloneRequire
  } catch {
    return packageRequire
  }
}

async function sourceFiles(root) {
  const files = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (
      entry.name.endsWith('.ts')
      && !entry.name.startsWith('client')
      && entry.name !== 'embed.ts'
      && !entry.name.endsWith('.test.ts')
    ) {
      files.push(path)
    }
  }
  return files
}

function packageName(specifier) {
  if (!specifier.startsWith('@')) return specifier.split('/')[0]
  return specifier.split('/').slice(0, 2).join('/')
}

async function resolvePackageDirectory(name, require) {
  const vendor = join(appDirectory, 'vendor', ...name.split('/'), 'package.json')
  try {
    await readFile(vendor)
    return dirname(vendor)
  } catch {
    return dirname(require.resolve(`${name}/package.json`))
  }
}

async function resolvePackageRoot(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const target = manifest.exports?.['.'] ?? manifest.exports
  const path = exportPath(target)
  return path === undefined ? directory : join(directory, path)
}

async function resolvePackageExport(specifier, name, directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const subpath = `.${specifier.slice(name.length)}`
  let matchedSubpath = subpath
  let target = manifest.exports?.[subpath]
  if (target === undefined) {
    matchedSubpath = Object.keys(manifest.exports ?? {}).find(key => {
      if (!key.includes('*')) return false
      const [prefix, suffix] = key.split('*')
      return subpath.startsWith(prefix) && subpath.endsWith(suffix)
    })
    target = matchedSubpath === undefined ? undefined : manifest.exports[matchedSubpath]
  }
  let path = exportPath(target)
  if (path === undefined) {
    throw new Error(`${name} does not export ${subpath} for the Worker build.`)
  }
  if (matchedSubpath?.includes('*')) {
    const [prefix, suffix] = matchedSubpath.split('*')
    const wildcard = subpath.slice(prefix.length, subpath.length - suffix.length)
    path = path.replace('*', wildcard)
  }
  return join(directory, path)
}

function exportPath(target) {
  if (typeof target === 'string') return target
  if (target === null || typeof target !== 'object') return undefined
  return exportPath(target.worker)
    ?? exportPath(target.browser)
    ?? exportPath(target.import)
    ?? exportPath(target.default)
}

/** Resolve published package aliases for Edge Worker source. */
export async function resolveWorkerAliases(options = {}) {
  const require = options.require ?? resolveRequire()
  const roots = options.roots ?? [join(appDirectory, 'src'), ...(options.extraRoots ?? [])]
  const specifiers = new Set()
  for (const root of roots) {
    for (const path of await sourceFiles(root)) {
      const source = await readFile(path, 'utf8')
      for (const match of source.matchAll(
        /['"]((?:@deepseek-ai|@cloudflare|@open-compute)\/[^'"]+|(?:just-bash|fast-png|jpeg-js)(?:\/[^'"]*)?)['"]/g,
      )) {
        specifiers.add(match[1])
      }
    }
  }
  const aliases = { ...(options.aliases ?? {}) }
  for (const specifier of [...specifiers].sort()) {
    if (aliases[specifier]) continue
    if (specifier.startsWith('@open-compute/dsh-edge/')) {
      const subpath = specifier.slice('@open-compute/dsh-edge/'.length)
      aliases[specifier] = join(appDirectory, 'src', `${subpath}.ts`)
      continue
    }
    const name = packageName(specifier)
    const directory = await resolvePackageDirectory(name, require)
    aliases[specifier] = specifier === name
      ? await resolvePackageRoot(directory)
      : await resolvePackageExport(specifier, name, directory)
  }
  return aliases
}

async function readSourceConfig() {
  const errors = []
  const source = await readFile(join(appDirectory, 'wrangler.jsonc'), 'utf8')
  const parsed = parse(source, errors, {
    allowEmptyContent: false,
    allowTrailingComma: true,
    disallowComments: false,
  })
  if (errors.length > 0) {
    const detail = errors.map(error => printParseErrorCode(error.error)).join(', ')
    throw new Error(`Could not parse wrangler.jsonc: ${detail}.`)
  }
  return parsed
}

/**
 * Bundle a Direct-mode Worker that embeds Edge source.
 * @param {{
 *   main: string,
 *   outdir: string,
 *   deploymentId?: string,
 *   assetsDirectory?: string,
 *   extraRoots?: string[],
 *   aliases?: Record<string, string>,
 *   define?: Record<string, string>,
 *   name?: string,
 * }} options
 */
export async function buildWorker(options) {
  if (typeof options?.main !== 'string' || options.main.length === 0) {
    throw new Error('buildWorker requires options.main')
  }
  if (typeof options?.outdir !== 'string' || options.outdir.length === 0) {
    throw new Error('buildWorker requires options.outdir')
  }
  const require = resolveRequire()
  const wranglerCli = require.resolve('wrangler')
  const outdir = resolve(options.outdir)
  await mkdir(outdir, { recursive: true })
  const sourceConfig = options.config ?? {
    name: options.name ?? 'open-compute-dsh-edge-embed',
    main: resolve(options.main),
    compatibility_date: (await readSourceConfig()).compatibility_date,
    compatibility_flags: ['nodejs_compat'],
    minify: true,
  }
  const aliases = await resolveWorkerAliases({
    require,
    extraRoots: options.extraRoots,
    aliases: {
      ...(options.aliases ?? {}),
      '@cloudflare/computer/shell/core': join(appDirectory, 'src/direct-shell-core-empty.ts'),
    },
  })
  const config = {
    ...sourceConfig,
    name: options.name ?? sourceConfig.name ?? 'open-compute-dsh-edge-embed',
    main: resolve(options.main),
    minify: true,
    alias: {
      ...sourceConfig.alias,
      ...aliases,
    },
  }
  if (options.assetsDirectory !== undefined) {
    config.assets = {
      binding: 'ASSETS',
      directory: resolve(options.assetsDirectory),
      not_found_handling: 'single-page-application',
    }
  }
  const configFile = join(outdir, 'wrangler.embed.json')
  await writeFile(configFile, `${JSON.stringify(config, undefined, 2)}\n`)
  const deploymentId = options.deploymentId ?? 'open-compute/dsh-edge/direct'
  const defineArgs = [
    '--define',
    `__DSH_EDGE_DEPLOYMENT_ID__:${JSON.stringify(deploymentId)}`,
  ]
  for (const [key, value] of Object.entries(options.define ?? {})) {
    defineArgs.push('--define', `${key}:${JSON.stringify(value)}`)
  }
  const result = await execa(process.execPath, [
    wranglerCli,
    'deploy',
    '--config', configFile,
    '--dry-run',
    '--outdir', outdir,
    ...defineArgs,
  ], {
    cwd: dirname(resolve(options.main)),
    reject: false,
    all: true,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_LOG_PATH: join(outdir, 'logs'),
    },
  })
  process.stdout.write(result.all?.endsWith('\n') ? result.all : `${result.all ?? ''}\n`)
  if (result.exitCode !== 0) {
    const error = new Error('Worker embed build failed.')
    error.exitCode = result.exitCode
    throw error
  }
  return { outdir, configFile }
}

/**
 * Assemble Edge Web assets for standalone or embedded hosts.
 * @param {{
 *   outDir: string,
 *   embedded?: boolean,
 *   clientPackage?: string,
 *   excludePackages?: string[],
 * }} options
 */
export async function assembleWeb(options) {
  if (typeof options?.outDir !== 'string' || options.outDir.length === 0) {
    throw new Error('assembleWeb requires options.outDir')
  }
  const publishedClient = join(appDirectory, 'edge-client/client.js')
  try {
    await readFile(publishedClient)
  } catch {
    const buildClient = await execa('pnpm', ['run', 'build:edge-client'], {
      cwd: standaloneDirectory,
      reject: false,
      all: true,
    })
    process.stdout.write(buildClient.all?.endsWith('\n') ? buildClient.all : `${buildClient.all ?? ''}\n`)
    if (buildClient.exitCode !== 0) {
      const error = new Error('Edge client build failed.')
      error.exitCode = buildClient.exitCode
      throw error
    }
    const stage = await execa(process.execPath, [join(appDirectory, 'scripts/stage-edge-client.mjs')], {
      cwd: appDirectory,
      reject: false,
      all: true,
    })
    process.stdout.write(stage.all?.endsWith('\n') ? stage.all : `${stage.all ?? ''}\n`)
    if (stage.exitCode !== 0) {
      const error = new Error('Edge client staging failed.')
      error.exitCode = stage.exitCode
      throw error
    }
  }
  const env = {
    ...process.env,
    DSH_EDGE_WEB_OUT_DIR: resolve(options.outDir),
    DSH_EDGE_WEB_EMBEDDED: options.embedded === true ? '1' : '0',
  }
  if (options.clientPackage) env.DSH_EDGE_WEB_CLIENT_PACKAGE = resolve(options.clientPackage)
  if (options.excludePackages?.length) {
    env.DSH_EDGE_WEB_EXCLUDE_PACKAGES = options.excludePackages.join(',')
  }
  const result = await execa(process.execPath, [
    join(standaloneDirectory, 'scripts/assemble-standalone-web.mjs'),
  ], {
    cwd: standaloneDirectory,
    reject: false,
    all: true,
    env,
  })
  process.stdout.write(result.all?.endsWith('\n') ? result.all : `${result.all ?? ''}\n`)
  if (result.exitCode !== 0) {
    const error = new Error('Web assembly failed.')
    error.exitCode = result.exitCode
    throw error
  }
  return { outDir: resolve(options.outDir) }
}

/**
 * Write a ModuleLoader-wrapped client plugin package for assembleWeb.
 * `code` must already be CommonJS that assigns `module.exports`.
 * @param {{
 *   outDir: string,
 *   id: string,
 *   code: string | Uint8Array,
 *   inject?: string[],
 *   fileName?: string,
 * }} options
 */
export async function packClientPlugin(options) {
  if (typeof options?.outDir !== 'string' || options.outDir.length === 0) {
    throw new Error('packClientPlugin requires options.outDir')
  }
  if (typeof options?.id !== 'string' || options.id.length === 0) {
    throw new Error('packClientPlugin requires options.id')
  }
  if (options.code === undefined) {
    throw new Error('packClientPlugin requires options.code')
  }
  const outDir = resolve(options.outDir)
  await mkdir(outDir, { recursive: true })
  const fileName = options.fileName ?? 'client.js'
  const body = typeof options.code === 'string'
    ? options.code
    : Buffer.from(options.code).toString('utf8')
  const wrapped = [
    `window.__ModuleLoader__.load({id:${JSON.stringify(options.id)},factory(require){`,
    'var module={exports:{}};var exports=module.exports;',
    body,
    '\nreturn module.exports;}});',
  ].join('')
  await writeFile(join(outDir, fileName), wrapped)
  const manifestPath = join(outDir, 'package.json')
  await writeFile(manifestPath, `${JSON.stringify({
    name: options.id,
    exports: { './client': `./${fileName}` },
    dsh: {
      client: {
        platform: 'web',
        inject: options.inject ?? [],
      },
    },
  }, undefined, 2)}\n`)
  return { outDir, manifestPath, fileName }
}

/**
 * Post-process assembled Web assets for iframe hosts.
 * Rewrites scoped plugin directories to URL-safe paths, strips `_headers`,
 * and optionally injects a bootstrap script into `index.html`.
 * @param {{
 *   webDir: string,
 *   urlSafeScopes?: string[],
 *   bootstrapCode?: string | Uint8Array,
 *   bootstrapFileName?: string,
 * }} options
 */
export async function finalizeEmbeddedWeb(options) {
  if (typeof options?.webDir !== 'string' || options.webDir.length === 0) {
    throw new Error('finalizeEmbeddedWeb requires options.webDir')
  }
  const webDir = resolve(options.webDir)
  const scopes = options.urlSafeScopes ?? ['@deepseek-ai']
  let index = await readFile(join(webDir, 'index.html'), 'utf8')
  for (const scope of scopes) {
    if (!scope.startsWith('@')) continue
    const scoped = join(webDir, 'plugins', scope)
    const safe = join(webDir, 'plugins', scope.slice(1))
    try {
      await rename(scoped, safe)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        continue
      }
      throw error
    }
    index = index.replaceAll(`./plugins/${scope}/`, `./plugins/${scope.slice(1)}/`)
  }
  await rm(join(webDir, '_headers'), { force: true })
  if (options.bootstrapCode !== undefined) {
    const bootstrapFileName = options.bootstrapFileName ?? 'lynx-embed.js'
    const bootstrap = typeof options.bootstrapCode === 'string'
      ? options.bootstrapCode
      : Buffer.from(options.bootstrapCode)
    await writeFile(join(webDir, bootstrapFileName), bootstrap)
    if (!index.includes(`src="./${bootstrapFileName}"`)) {
      index = index.replace('<head>', `<head><script src="./${bootstrapFileName}"></script>`)
    }
  }
  await writeFile(join(webDir, 'index.html'), index)
  return { webDir }
}
