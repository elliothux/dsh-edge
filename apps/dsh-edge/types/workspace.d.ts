export declare class EdgeWorkspaceRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string)
}

export interface EdgeWorkspaceFiles {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  writeFile(
    path: string,
    data: Uint8Array,
    options?: { exclusive?: boolean },
  ): Promise<void>
  readFile(path: string): Promise<ReadableStream<Uint8Array>>
  stat(path: string): Promise<{ size: number }>
}

export type EdgeWorkspace = {
  fs: EdgeWorkspaceFiles
  [Symbol.dispose]?: () => void
}

export declare function requireWorkspacePath(value: unknown): string

export declare function readBoundedWorkspaceFile(
  files: EdgeWorkspaceFiles,
  path: string,
): Promise<Uint8Array<ArrayBuffer>>
