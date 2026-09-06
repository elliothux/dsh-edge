/** Type declarations for the embed build API. */

export function resolveWorkerAliases(options?: {
  require?: NodeRequire
  roots?: string[]
  extraRoots?: string[]
  aliases?: Record<string, string>
}): Promise<Record<string, string>>

export function buildWorker(options: {
  main: string
  outdir: string
  deploymentId?: string
  assetsDirectory?: string
  extraRoots?: string[]
  aliases?: Record<string, string>
  define?: Record<string, string>
  name?: string
  config?: Record<string, unknown>
}): Promise<{ outdir: string; configFile: string }>

export function assembleWeb(options: {
  outDir: string
  embedded?: boolean
  clientPackage?: string
  excludePackages?: string[]
}): Promise<{ outDir: string }>

export function packClientPlugin(options: {
  outDir: string
  id: string
  code: string | Uint8Array
  inject?: string[]
  fileName?: string
}): Promise<{ outDir: string; manifestPath: string; fileName: string }>

export function finalizeEmbeddedWeb(options: {
  webDir: string
  urlSafeScopes?: string[]
  bootstrapCode?: string | Uint8Array
  bootstrapFileName?: string
}): Promise<{ webDir: string }>
