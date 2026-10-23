import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PipelineService } from '../../src/host/domain/pipeline-service.js'
import type { FetchRoute, HostContext } from '../../src/host/plugin-context.js'
import { registerRoutes } from '../../src/host/routes/index.js'
import { openStore, type CicdStore } from '../../src/host/store/sqlite-store.js'

const dirs: string[] = []
let store: CicdStore | undefined

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-routes-'))
  dirs.push(dir)
  store = openStore({ databasePath: join(dir, 'cicd.db') })
  const service = new PipelineService({ store })
  const routes = new Map<string, FetchRoute>()
  const ctx: HostContext = {
    connection: {
      fetch: {
        register(route: FetchRoute) {
          if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    },
  }
  const registration = registerRoutes({
    ctx,
    service,
    logger: { info() {}, warn() {} },
  })
  return { service, routes, registration }
}

async function call(routes: Map<string, FetchRoute>, method: string, path: string, body?: unknown) {
  const routePath = path.split('?')[0] ?? path
  const route = routes.get(routePath)
  if (!route) throw new Error(`route not found: ${routePath}`)
  if (!route.methods.includes(method)) throw new Error(`method not registered: ${method} ${routePath}`)
  const request = new Request(`http://127.0.0.1${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const response = await route.fetch(request)
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

afterEach(() => {
  try {
    store?.close()
  } catch {
    // ignore
  }
  store = undefined
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('authenticated routes', () => {
  it('returns bootstrap data with honest capabilities', async () => {
    const { routes } = setup()
    const response = await call(routes, 'GET', '/api/cicd/bootstrap')
    expect(response.status).toBe(200)
    expect(response.body.pipelines).toEqual([])
    const capabilities = response.body.capabilities as { pipelineExecution: { available: boolean } }
    expect(capabilities.pipelineExecution.available).toBe(false)
  })

  it('creates and reads a pipeline', async () => {
    const { routes } = setup()
    const created = await call(routes, 'POST', '/api/cicd/pipelines', { pipeline: { name: 'demo' } })
    expect(created.status).toBe(201)
    const pipeline = created.body.pipeline as { id: string }
    expect(pipeline.id).toMatch(/^pl_/)
    const detail = await call(routes, 'GET', `/api/cicd/pipeline?id=${pipeline.id}`)
    expect(detail.status).toBe(200)
    expect((detail.body.pipeline as { name: string }).name).toBe('demo')
  })

  it('rejects malformed JSON with 400, not 500', async () => {
    const { routes } = setup()
    const route = routes.get('/api/cicd/pipelines')
    if (!route) throw new Error('route missing')
    const response = await route.fetch(new Request('http://127.0.0.1/api/cicd/pipelines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    }))
    expect(response.status).toBe(400)
  })

  it('returns EXECUTION_NOT_READY for a start attempt without a starter', async () => {
    const { routes, service } = setup()
    const pipeline = service.createPipeline({ name: 'start-test' }).pipeline
    const response = await call(routes, 'POST', '/api/cicd/run/start', { pipelineId: pipeline.id })
    expect(response.status).toBe(501)
    expect((response.body.error as { code: string }).code).toBe('EXECUTION_NOT_READY')
  })

  it('disposes routes cleanly', () => {
    const { registration } = setup()
    registration.dispose()
  })
})
