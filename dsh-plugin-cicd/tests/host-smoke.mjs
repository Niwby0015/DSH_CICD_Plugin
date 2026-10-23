// Loads the built Host bundle with a minimal Cordis-like context. This checks
// activation, SQLite persistence and authenticated route registration without
// starting a DSH process or touching the real profile data.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-host-smoke-'))
const routes = new Map()
const cleanups = []
try {
  const module = await import(pathToFileURL(join(process.cwd(), 'dist/host/index.js')).href)
  const scope = {
    connection: {
      fetch: {
        register(route) {
          if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    },
    subprocess: {
      async resolveExecutable(name) {
        return name
      },
      spawn() {
        return {
          done: Promise.resolve({ exitCode: 0, signal: null }),
          collected: {
            stdout: { readFrom: () => ({ text: '' }) },
            stderr: { readFrom: () => ({ text: '' }) },
          },
        }
      },
    },
    credentials: {
      async resolve() {
        return undefined
      },
      async describe() {
        return { configured: false, writable: true }
      },
      async set() {},
      async unset() {},
    },
  }
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    inject(_deps, callback) {
      return callback(scope)
    },
    effect(callback) {
      const cleanup = callback()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    },
  }
  module.apply(ctx, { dataDir: dir, databasePath: join(dir, 'cicd.db') })
  if (routes.size < 24) throw new Error(`routes not registered: ${routes.size}`)
  if (!routes.get('/api/cicd/runner/preflight')) throw new Error('runner preflight route missing')
  if (!routes.get('/api/cicd/git/workspaces')) throw new Error('workspace route missing')
  const bootstrap = routes.get('/api/cicd/bootstrap')
  if (!bootstrap) throw new Error('bootstrap route missing')
  const response = await bootstrap.fetch(new Request('http://127.0.0.1/api/cicd/bootstrap'))
  if (response.status !== 200) throw new Error(`bootstrap status ${response.status}`)
  const payload = await response.json()
  if (!Array.isArray(payload.pipelines) || payload.pipelines.length !== 0) throw new Error('bootstrap is not empty')
  if (payload.capabilities.pipelineExecution.available !== false) throw new Error('execution must not be advertised')
  if (payload.capabilities.git.available !== true) throw new Error('Git capability was not enabled')
  const create = routes.get('/api/cicd/pipelines')
  if (!create) throw new Error('create route missing')
  const created = await create.fetch(new Request('http://127.0.0.1/api/cicd/pipelines', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pipeline: { name: 'host smoke' } }),
  }))
  if (created.status !== 201) throw new Error(`create status ${created.status}`)
  const createdPayload = await created.json()
  if (!createdPayload.pipeline?.id?.startsWith('pl_')) throw new Error('pipeline id missing')
  const get = routes.get('/api/cicd/pipeline')
  const detail = await get.fetch(new Request(`http://127.0.0.1/api/cicd/pipeline?id=${encodeURIComponent(createdPayload.pipeline.id)}`))
  if (detail.status !== 200) throw new Error(`detail status ${detail.status}`)
  const detailPayload = await detail.json()
  if (detailPayload.pipeline.name !== 'host smoke') throw new Error('pipeline was not read back')
  console.log(`PASS host bundle activated; routes=${routes.size}; pipeline=${createdPayload.pipeline.id}`)
} finally {
  for (const cleanup of cleanups.reverse()) {
    try {
      cleanup()
    } catch {
      // best effort
    }
  }
  rmSync(dir, { recursive: true, force: true })
}







