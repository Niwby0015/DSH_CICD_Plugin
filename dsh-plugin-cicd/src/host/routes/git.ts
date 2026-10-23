import type { GitService } from '../git/git-service.js'
import type { PrepareInput } from '../git/git-service.js'
import type { GitTarget } from '../git/types.js'
import { CicdError } from '../util/errors.js'
import type { CredentialsService, HostContext, HostLogger } from '../plugin-context.js'
import type { PipelineService } from '../domain/pipeline-service.js'
import { body, fail, json } from './index.js'

export const GITHUB_TOKEN_REF = 'DSH_CICD_GITHUB_TOKEN'

function requireGit(getGit: () => GitService | undefined): GitService {
  const git = getGit()
  if (!git) {
    throw new CicdError('UNAVAILABLE', 'Git execution is unavailable: ctx.subprocess is not mounted', 503)
  }
  return git
}

function requireCredentials(getCredentials: () => CredentialsService | undefined): CredentialsService {
  const credentials = getCredentials()
  if (!credentials) {
    throw new CicdError('CREDENTIALS_UNAVAILABLE', 'DSH credentials service is not mounted', 503)
  }
  return credentials
}

function targetOf(service: PipelineService, payload: Record<string, unknown>): GitTarget {
  const pipelineId = typeof payload.pipelineId === 'string' ? payload.pipelineId : ''
  const explicitPath = typeof payload.projectPath === 'string' ? payload.projectPath.trim() : ''
  const remoteUrl = typeof payload.remoteUrl === 'string' ? payload.remoteUrl.trim() : ''
  if (explicitPath) {
    return {
      projectPath: explicitPath,
      remoteUrl: remoteUrl || undefined,
      pipelineId: pipelineId || undefined,
    }
  }
  if (!pipelineId) throw new CicdError('INVALID_INPUT', 'pipelineId or projectPath is required', 400)
  const pipeline = service.getPipeline(pipelineId)
  if (!pipeline.projectPath) {
    throw new CicdError('INVALID_INPUT', 'pipeline projectPath is empty; edit the pipeline first', 400)
  }
  return {
    projectPath: pipeline.projectPath,
    remoteUrl: remoteUrl || pipeline.repoUrl || undefined,
    pipelineId,
  }
}

function strings(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new CicdError('INVALID_INPUT', 'files must be an array of strings', 400)
  }
  return value as string[]
}

export function registerGitRoutes(input: {
  ctx: HostContext
  service: PipelineService
  getGit: () => GitService | undefined
  getCredentials: () => CredentialsService | undefined
  getWorkspaces: () => Array<{ path: string; title: string }>
  logger: HostLogger
}): { dispose(): void } {
  const { ctx, service, getGit, getCredentials, getWorkspaces, logger } = input
  const connection = ctx.connection
  if (!connection) throw new Error('connection service is not available')
  const disposers: Array<() => void> = []
  const register = (route: Parameters<typeof connection.fetch.register>[0]) => {
    disposers.push(connection.fetch.register(route))
  }

  try {
    register({
      path: '/api/cicd/git/workspaces',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => {
        try {
          return json({ workspaces: getWorkspaces() })
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/git/inspect',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          return json(await requireGit(getGit).inspect(targetOf(service, payload)))
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/git/prepare',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          const message = typeof payload.message === 'string' ? payload.message : ''
          const plan: PrepareInput = {
            message,
            files: strings(payload.files),
            pushBranch: typeof payload.pushBranch === 'string' ? payload.pushBranch : undefined,
          }
          return json(await requireGit(getGit).prepare(targetOf(service, payload), plan))
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/git/commit',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          const planId = typeof payload.planId === 'string' ? payload.planId : ''
          if (!planId) throw new CicdError('INVALID_INPUT', 'planId is required', 400)
          return json(await requireGit(getGit).commit(planId, payload.confirm === true))
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/git/branches',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          return json(await requireGit(getGit).branches(targetOf(service, payload)))
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/git/resolve',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          const ref = typeof payload.ref === 'string' ? payload.ref : ''
          return json({ sha: await requireGit(getGit).resolveCommit(targetOf(service, payload), ref) })
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/git/push',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          const branch = typeof payload.branch === 'string' ? payload.branch : ''
          if (!branch) throw new CicdError('INVALID_INPUT', 'branch is required', 400)
          const expectedSha = typeof payload.commitSha === 'string' ? payload.commitSha : undefined
          return json(await requireGit(getGit).push(targetOf(service, payload), branch, expectedSha))
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/credentials/github',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const credentials = requireCredentials(getCredentials)
          if (request.method === 'GET') {
            const info = await credentials.describe(GITHUB_TOKEN_REF)
            return json({
              configured: info.configured,
              writable: info.writable,
              source: info.source ?? null,
              ref: GITHUB_TOKEN_REF,
            })
          }
          const payload = await body(request)
          if (payload.clear === true) {
            await credentials.unset(GITHUB_TOKEN_REF)
            return json({ configured: false })
          }
          const token = typeof payload.token === 'string' ? payload.token.trim() : ''
          if (token.length < 8) throw new CicdError('INVALID_INPUT', 'GitHub token is too short', 400)
          if (token.length > 2000) throw new CicdError('INVALID_INPUT', 'GitHub token is too long', 400)
          await credentials.set(GITHUB_TOKEN_REF, token)
          const info = await credentials.describe(GITHUB_TOKEN_REF)
          if (!info.configured) {
            throw new CicdError('CREDENTIALS_UNAVAILABLE', 'credential store did not report the token as configured', 500)
          }
          return json({ configured: true, source: info.source ?? null })
        } catch (error) {
          return fail(error)
        }
      },
    })
  } catch (error) {
    logger.warn(`Git routes not registered: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    dispose() {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch {
          // best effort
        }
      }
    },
  }
}
