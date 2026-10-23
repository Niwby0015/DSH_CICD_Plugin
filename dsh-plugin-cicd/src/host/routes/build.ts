import type { BuildConfig, LanguageKind } from '../domain/types.js'
import { createBuildPlan } from '../language/planner.js'
import { detectProject } from '../language/detector.js'
import type { HostContext, HostLogger } from '../plugin-context.js'
import { CicdError } from '../util/errors.js'
import { body, fail, json } from './index.js'

const LANGUAGES = new Set<LanguageKind>(['auto', 'java-maven', 'java-gradle', 'node', 'python', 'go', 'custom'])

function inputOf(payload: Record<string, unknown>): { projectPath: string; projectSubdir: string; language: LanguageKind; build: Partial<BuildConfig> } {
  const projectPath = typeof payload.projectPath === 'string' ? payload.projectPath.trim() : ''
  if (!projectPath) throw new CicdError('INVALID_INPUT', 'projectPath is required', 400)
  const requested = typeof payload.language === 'string' ? payload.language : 'auto'
  if (!LANGUAGES.has(requested as LanguageKind)) throw new CicdError('INVALID_INPUT', 'unsupported language', 400)
  const raw = payload.build
  const build = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Partial<BuildConfig>)
    : {}
  return {
    projectPath,
    projectSubdir: typeof payload.projectSubdir === 'string' ? payload.projectSubdir.trim() : '',
    language: requested as LanguageKind,
    build,
  }
}

export function registerBuildRoutes(input: {
  ctx: HostContext
  logger: HostLogger
}): { dispose(): void } {
  const { ctx, logger } = input
  const connection = ctx.connection
  if (!connection) throw new Error('connection service is required for build routes')
  const disposers: Array<() => void> = []
  const register = (route: Parameters<typeof connection.fetch.register>[0]) => {
    disposers.push(connection.fetch.register(route))
  }

  try {
    register({
      path: '/api/cicd/build/detect',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          const input = inputOf(payload)
          return json(await detectProject(input.projectPath, input.projectSubdir))
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/build/plan',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await body(request)
          const input = inputOf(payload)
          return json(await createBuildPlan(input))
        } catch (error) {
          return fail(error)
        }
      },
    })
  } catch (error) {
    logger.warn(`Build routes not registered: ${error instanceof Error ? error.message : String(error)}`)
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
