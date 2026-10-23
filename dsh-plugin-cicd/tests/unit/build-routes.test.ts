import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { registerBuildRoutes } from '../../src/host/routes/build.js'
import type { FetchRoute, HostContext } from '../../src/host/plugin-context.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cicd-build-routes-'))
  dirs.push(root)
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
  }
  return root
}

function setup() {
  const routes = new Map<string, FetchRoute>()
  const ctx = {
    connection: {
      fetch: {
        register(route: FetchRoute) {
          if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    },
  } as unknown as HostContext
  const registration = registerBuildRoutes({ ctx, logger: { info() {}, warn() {} } })
  return { routes, registration }
}

async function call(routes: Map<string, FetchRoute>, method: string, path: string, body: unknown) {
  const route = routes.get(path)
  if (!route || !route.methods.includes(method)) throw new Error(`route missing: ${method} ${path}`)
  const response = await route.fetch(new Request(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

describe('build routes', () => {
  it('detects a project and previews its plan', async () => {
    const root = fixture({
      'package.json': JSON.stringify({ scripts: { build: 'tsc', test: 'vitest run' } }),
      'package-lock.json': '{}',
    })
    const { routes } = setup()
    const detected = await call(routes, 'POST', '/api/cicd/build/detect', { projectPath: root })
    expect(detected.status).toBe(200)
    expect((detected.body.candidates as unknown[]).length).toBe(1)
    const planned = await call(routes, 'POST', '/api/cicd/build/plan', {
      projectPath: root,
      language: 'node',
      build: { testCommand: 'npm test -- --run' },
    })
    expect(planned.status).toBe(200)
    expect(planned.body.testCommand).toBe('npm test -- --run')
    expect(planned.body.dockerfile).toContain('FROM node:22-bookworm-slim')
  })

  it('returns a clear error for an ambiguous repository', async () => {
    const root = fixture({
      'package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
      'go.mod': 'module example.com/app\n',
    })
    const { routes } = setup()
    const result = await call(routes, 'POST', '/api/cicd/build/plan', { projectPath: root })
    expect(result.status).toBe(400)
    expect((result.body.error as { code: string }).code).toBe('BUILD_LANGUAGE_AMBIGUOUS')
  })
})
