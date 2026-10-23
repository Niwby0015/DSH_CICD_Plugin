import type { PipelineService } from '../domain/pipeline-service.js'
import type { PipelineDraft } from '../domain/types.js'
import { CicdError, isCicdError } from '../util/errors.js'
import type { HostContext, HostLogger } from '../plugin-context.js'
import { redactText } from '../security/redactor.js'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

const MAX_BODY_BYTES = 1_000_000

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export function fail(error: unknown): Response {
  if (isCicdError(error)) {
    return json(
      { error: { code: error.code, message: redactText(error.message), details: error.details ?? null } },
      error.status,
    )
  }
  return json({ error: { code: 'INTERNAL', message: 'internal error' } }, 500)
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new CicdError('INVALID_INPUT', 'request body is too large', 413)
  }
  try {
    const parsed: unknown = await request.json()
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed as Record<string, unknown>
  } catch {
    throw new CicdError('INVALID_INPUT', 'request body must be a JSON object', 400)
  }
}

function intParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? '')
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.trunc(parsed))
}

export interface RouteRegistration {
  dispose(): void
}

export function registerRoutes(input: {
  ctx: HostContext
  service: PipelineService
  logger: HostLogger
}): RouteRegistration {
  const { ctx, service, logger } = input
  const connection = ctx.connection
  if (!connection) throw new Error('connection service is not available')
  const disposers: Array<() => void> = []
  const register = (route: Parameters<typeof connection.fetch.register>[0]) => {
    disposers.push(connection.fetch.register(route))
  }

  try {
    register({
      path: '/api/cicd/bootstrap',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => json(service.bootstrap()),
    })

    register({
      path: '/api/cicd/capabilities',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => json({ capabilities: service.capabilities() }),
    })

    register({
      path: '/api/cicd/pipelines',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        if (request.method === 'GET') {
          const limit = intParam(new URL(request.url).searchParams.get('limit'), 100, 500)
          return json({ pipelines: service.listPipelines(limit) })
        }
        try {
          const payload = await body(request)
          const id = typeof payload.id === 'string' ? payload.id : ''
          const draft = payload.pipeline
          if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
            return json({ error: { code: 'INVALID_INPUT', message: 'pipeline object is required' } }, 400)
          }
          const saved = id
            ? service.updatePipeline(id, draft as PipelineDraft)
            : service.createPipeline(draft as PipelineDraft)
          return json(saved, saved.created ? 201 : 200)
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/pipeline',
      methods: ['GET', 'DELETE'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const id = new URL(request.url).searchParams.get('id') ?? ''
          if (request.method === 'DELETE') {
            service.deletePipeline(id)
            return json({ deleted: true })
          }
          return json(service.detail(id))
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/runs',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const url = new URL(request.url)
          const pipelineId = url.searchParams.get('pipelineId') ?? undefined
          const limit = intParam(url.searchParams.get('limit'), 50, 200)
          return json({ runs: service.listRuns(limit, pipelineId) })
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/run',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const id = new URL(request.url).searchParams.get('id') ?? ''
          return json(service.runDetail(id))
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/logs',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id') ?? ''
          const stage = url.searchParams.get('stage') ?? undefined
          const after = intParam(url.searchParams.get('after'), 0, Number.MAX_SAFE_INTEGER)
          const limit = intParam(url.searchParams.get('limit'), 500, 2000)
          return json({ logs: service.listLogs(id, stage, after, limit) })
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/run/start',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          const pipelineId = typeof payload.pipelineId === 'string' ? payload.pipelineId : ''
          if (!pipelineId) return json({ error: { code: 'INVALID_INPUT', message: 'pipelineId is required' } }, 400)
          return json(service.startRun(pipelineId), 202)
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/run/cancel',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          const runId = typeof payload.runId === 'string' ? payload.runId : ''
          if (!runId) return json({ error: { code: 'INVALID_INPUT', message: 'runId is required' } }, 400)
          return json(service.cancelRun(runId), 202)
        } catch (error) {
          return fail(error)
        }
      },
    })
  } catch (error) {
    logger.warn(`page routes not registered: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    dispose() {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch {
          // route disposal is best effort
        }
      }
    },
  }
}
