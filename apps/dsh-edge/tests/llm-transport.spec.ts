import type { AnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import { DeepSeekAdapter, resolveAdapterOptions } from '@deepseek-ai/dsh-llm-deepseek'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

it('uses the injected service transport and the native SSE parser', async () => {
  const network = vi.fn(() => { throw new Error('Public network is unavailable') })
  vi.stubGlobal('fetch', network)
  const transport = vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    expect(request.url).toBe('https://service.invalid/chat/completions')
    expect(request.headers.get('authorization')).toBe('Bearer service-binding')
    expect(await request.json()).toMatchObject({ model: 'test-model', stream: true })
    return new Response('data: {"id":"response-1","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n\ndata: {"id":"response-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    })
  })
  const adapter = new DeepSeekAdapter({
    options: () => resolveAdapterOptions({ baseURL: 'https://service.invalid' }),
    resolveApiKey: async () => 'service-binding',
    resolveUserId: () => 'test-user' as AnonymousUserId,
    prepareExtensions: async () => ({ fields: {}, accept: async () => {} }),
    fetch: transport,
  })
  const chunks = []
  for await (const chunk of adapter.stream({ provider: 'test', model: 'test-model', messages: [] })) chunks.push(chunk)
  expect(chunks).toContainEqual({ type: 'text-delta', index: 0, text: 'hello' })
  expect(transport).toHaveBeenCalledOnce()
  expect(network).not.toHaveBeenCalled()
})
