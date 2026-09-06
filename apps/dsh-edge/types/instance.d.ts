import type { Context } from '@deepseek-ai/cordis'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import { DurableObject } from 'cloudflare:workers'

export interface EdgeIntegration {
  installPlugins(this: void, ctx: Context): Promise<void>
  installAgentPlugins(this: void, ctx: Context): Promise<void>
  systemPrompt: string
  defaultSelection(this: void): ModelSelection | undefined
  attachmentObjectKey(this: void, digest: string): string
  authorization: {
    current(): { key: string; expiresAt: number }
    renew(key: string): Promise<number>
    run<T>(key: string, expiresAt: number, operation: () => T): T
    intervalMs: number
  }
}

export interface EdgeEnv {
  integration?: EdgeIntegration
  DSH_EDGE_INSTANCE: DurableObjectNamespace
  ASSETS: Fetcher
  LOADER?: unknown
  DSH_EDGE_ATTACHMENTS?: R2Bucket
  DSH_EDGE_ACCESS_KEY?: string
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_BASE_URL?: string
  DEEPSEEK_MAX_OUTPUT_TOKENS?: string
  DEEPSEEK_MODEL?: string
  DEEPSEEK_REASONING_EFFORT?: string
  DEEPSEEK_SEARCH_BASE_URL?: string
  DEEPSEEK_STREAM_IDLE_TIMEOUT_MS?: string
  DSH_EDGE_DEFAULT_COMMAND_TIMEOUT_MS?: string
  DSH_EDGE_MAX_COMMAND_TIMEOUT_MS?: string
  CORE?: Fetcher
}

/** Embeddable Durable Object base class for host subclasses such as LynxAgent. */
export declare class DshEdgeInstance extends DurableObject<EdgeEnv> {
  constructor(ctx: DurableObjectState, env: EdgeEnv)
  declare readonly ctx: DurableObjectState
  declare readonly env: EdgeEnv
  protected readonly sessions: {
    getApiSessionSummary(
      id: string,
    ): Promise<{ cwd?: string } | undefined>
  }
  fetch(request: Request): Promise<Response>
  alarm(): Promise<void>
  webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void>
  protected drain(): Promise<void>
}
