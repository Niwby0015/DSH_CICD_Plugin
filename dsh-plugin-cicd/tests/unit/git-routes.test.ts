import { describe, expect, it } from 'vitest'
import type { GitService } from '../../src/host/git/git-service.js'
import type { GitBranches, GitCommitPreview, GitCommitResult, GitInspection } from '../../src/host/git/types.js'
import type { CredentialsService, FetchRoute, HostContext } from '../../src/host/plugin-context.js'
import type { PipelineService } from '../../src/host/domain/pipeline-service.js'
import { registerGitRoutes } from '../../src/host/routes/git.js'

const inspection: GitInspection = {
  pipelineId: 'pl_1',
  root: 'D:\\work\\demo',
  branch: 'main',
  upstream: 'origin/main',
  remoteUrl: 'https://github.com/acme/demo.git',
  headSha: 'a'.repeat(40),
  ahead: 0,
  behind: 0,
  clean: false,
  entries: [{ path: 'app.ts', index: ' ', worktree: 'M', kind: 'modified', staged: false, selectable: true }],
  defaultFiles: ['app.ts'],
  diffs: [{ path: 'app.ts', text: '+console.log(1)', truncated: false, binary: false }],
  sensitive: [],
  userName: 'Test',
  userEmail: 'test@example.com',
}

const preview: GitCommitPreview = {
  planId: 'gplan_1',
  expiresAt: Date.now() + 60_000,
  pipelineId: 'pl_1',
  root: 'D:\\work\\demo',
  branch: 'main',
  pushBranch: 'main',
  remoteUrl: inspection.remoteUrl,
  headSha: inspection.headSha,
  message: 'test',
  selectedFiles: ['app.ts'],
  entries: inspection.entries,
  diffs: inspection.diffs,
  sensitive: [],
  canCommit: true,
}

const committed: GitCommitResult = {
  commitSha: 'b'.repeat(40),
  branch: 'main',
  pushBranch: 'main',
  remoteUrl: inspection.remoteUrl,
  remoteSha: 'b'.repeat(40),
  verified: true,
  pushed: true,
  message: 'test',
  committedAt: Date.now(),
}

const branches: GitBranches = { current: 'main', local: ['main'], remote: ['main'] }

function setup() {
  const routes = new Map<string, FetchRoute>()
  const refs = new Map<string, string>()
  const credentials: CredentialsService = {
    async resolve(ref) {
      const value = refs.get(ref)
      return value ? { value, source: 'stored' } : undefined
    },
    async describe(ref) {
      return { configured: refs.has(ref), writable: true, ...(refs.has(ref) ? { source: 'stored' } : {}) }
    },
    async set(ref, value) {
      refs.set(ref, value)
    },
    async unset(ref) {
      refs.delete(ref)
    },
  }
  const git = {
    inspect: async () => inspection,
    prepare: async () => preview,
    commit: async (_planId: string, confirmed: boolean) => {
      if (!confirmed) throw new Error('not confirmed')
      return committed
    },
    branches: async () => branches,
    resolveCommit: async () => 'a'.repeat(40),
    push: async () => committed,
  } as unknown as GitService
  const service = {
    getPipeline: () => ({ projectPath: 'D:\\work\\demo' }),
  } as unknown as PipelineService
  const ctx: HostContext = {
    connection: {
      fetch: {
        register(route) {
          if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    },
  }
  const registration = registerGitRoutes({
    ctx,
    service,
    getGit: () => git,
    getCredentials: () => credentials,
    getWorkspaces: () => [{ path: 'D:\\work\\demo', title: 'demo' }],
    logger: { info() {}, warn() {} },
  })
  return { routes, registration, refs }
}

async function call(routes: Map<string, FetchRoute>, method: string, path: string, body?: unknown) {
  const route = routes.get(path)
  if (!route) throw new Error(`route missing: ${path}`)
  if (!route.methods.includes(method)) throw new Error(`method missing: ${method} ${path}`)
  const response = await route.fetch(new Request(`http://127.0.0.1${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }))
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

describe('Git routes', () => {
  it('inspects and prepares a commit', async () => {
    const { routes } = setup()
    const result = await call(routes, 'POST', '/api/cicd/git/inspect', { pipelineId: 'pl_1' })
    expect(result.status).toBe(200)
    expect((result.body.entries as unknown[]).length).toBe(1)
    const prepared = await call(routes, 'POST', '/api/cicd/git/prepare', {
      pipelineId: 'pl_1',
      files: ['app.ts'],
      message: 'test',
      pushBranch: 'main',
    })
    expect(prepared.status).toBe(200)
    expect(prepared.body.planId).toBe('gplan_1')
  })

  it('supports a standalone project path and remote target', async () => {
    const { routes } = setup()
    const workspaces = await call(routes, 'GET', '/api/cicd/git/workspaces')
    expect(workspaces.status).toBe(200)
    expect((workspaces.body.workspaces as unknown[]).length).toBe(1)
    const inspected = await call(routes, 'POST', '/api/cicd/git/inspect', {
      projectPath: 'D:\\work\\demo',
      remoteUrl: 'https://github.com/acme/target.git',
    })
    expect(inspected.status).toBe(200)
    const prepared = await call(routes, 'POST', '/api/cicd/git/prepare', {
      projectPath: 'D:\\work\\demo',
      remoteUrl: 'https://github.com/acme/target.git',
      files: ['app.ts'],
      message: 'standalone',
      pushBranch: 'main',
    })
    expect(prepared.status).toBe(200)
  })

  it('never returns a token from the credential API', async () => {
    const { routes, refs } = setup()
    const before = await call(routes, 'GET', '/api/cicd/credentials/github')
    expect(before.body.configured).toBe(false)
    const saved = await call(routes, 'POST', '/api/cicd/credentials/github', { token: 'ghp_fake_token_1234567890' })
    expect(saved.body.configured).toBe(true)
    expect(JSON.stringify(saved.body)).not.toContain('ghp_')
    const after = await call(routes, 'GET', '/api/cicd/credentials/github')
    expect(after.body.configured).toBe(true)
    expect(JSON.stringify(after.body)).not.toContain('ghp_')
    expect(refs.get('DSH_CICD_GITHUB_TOKEN')).toContain('ghp_')
    const cleared = await call(routes, 'POST', '/api/cicd/credentials/github', { clear: true })
    expect(cleared.body.configured).toBe(false)
  })

  it('commits only with confirm true', async () => {
    const { routes } = setup()
    const result = await call(routes, 'POST', '/api/cicd/git/commit', { planId: 'gplan_1', confirm: true })
    expect(result.status).toBe(200)
    expect(result.body.commitSha).toBe('b'.repeat(40))
    const denied = await call(routes, 'POST', '/api/cicd/git/commit', { planId: 'gplan_1', confirm: false })
    expect(denied.status).toBe(500)
  })

  it('retries a push for an existing commit', async () => {
    const { routes } = setup()
    const result = await call(routes, 'POST', '/api/cicd/git/push', {
      projectPath: 'D:\\work\\demo',
      branch: 'main',
      commitSha: 'b'.repeat(40),
    })
    expect(result.status).toBe(200)
    expect(result.body.verified).toBe(true)
  })
})
