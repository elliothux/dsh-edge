export declare class EdgeHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string)
}

export declare function readBoundedBody(
  request: Request,
  maxBytes: number,
  message: string,
): Promise<Uint8Array<ArrayBuffer>>

export declare function readBoundedText(
  request: Request,
  maxBytes: number,
  message: string,
): Promise<string>

export declare function errorResponse(error: unknown): Response
export declare function jsonResponse(value: unknown, status?: number): Response
