import type { ProcessRunner } from '../git/process.js'
import type { CredentialsService, HostContext, HostLogger } from '../plugin-context.js'
import type { CicdStore } from '../store/sqlite-store.js'
import { SshBuildRunner } from '../runner/ssh/ssh-runner.js'
import type { SshAuthKind, SshRunnerConfig } from '../runner/types.js'
import { CicdError } from '../util/errors.js'
import { body, fail, json } from './index.js'

const AUTH_KINDS = new Set<SshAuthKind>(['agent', 'key', 'password'])
export const SSH_PASSWORD_REF = 'DSH_CICD_SSH_PASSWORD'
export const REGISTRY_USERNAME_REF = 'DSH_CICD_REGISTRY_USERNAME'
export const REGISTRY_PASSWORD_REF = 'DSH_CICD_REGISTRY_PASSWORD'

function configOf(payload: Record<string, unknown>): SshRunnerConfig {
  const text = (key: string) => typeof payload[key] === 'string' ? payload[key]!.trim() : ''
  const host = text('host')
  const user = text('user')
  if (!host || !user) throw new CicdError('INVALID_INPUT', 'SSH host and user are required', 400)
  const port = typeof payload.port === 'number' ? payload.port : Number(text('port') || 22)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CicdError('INVALID_INPUT', 'SSH port is invalid', 400)
  const auth = (text('auth') || 'agent') as SshAuthKind
  if (!AUTH_KINDS.has(auth)) throw new CicdError('INVALID_INPUT', 'SSH auth must be agent, key or password', 400)
  if (auth === 'key' && !text('keyPath')) throw new CicdError('INVALID_INPUT', 'keyPath is required for key auth', 400)
  const knownHostsPath = text('knownHostsPath')
  if (!knownHostsPath) throw new CicdError('INVALID_INPUT', 'knownHostsPath is required', 400)
  return {
    kind: 'ssh',
    host,
    port,
    user,
    auth,
    ...(text('keyPath') ? { keyPath: text('keyPath') } : {}),
    ...(text('passwordRef') ? { passwordRef: text('passwordRef') } : {}),
    ...(text('expectedFingerprint') ? { expectedFingerprint: text('expectedFingerprint') } : {}),
    knownHostsPath,
    workspaceRoot: text('workspaceRoot') || '/tmp/dsh-cicd',
    connectTimeoutSec: Number(text('connectTimeoutSec') || 15),
  }
}

export function registerRunnerRoutes(input: {
  ctx: HostContext
  store: CicdStore
  getProcessRunner: () => ProcessRunner | undefined
  getCredentials: () => CredentialsService | undefined
  onProfileSaved?: () => void
  logger: HostLogger
}): { dispose(): void } {
  const { ctx, store, getProcessRunner, getCredentials, onProfileSaved, logger } = input
  const connection = ctx.connection
  if (!connection) throw new Error('connection service is required for runner routes')
  const disposers: Array<() => void> = []
  const register = (route: Parameters<typeof connection.fetch.register>[0]) => {
    disposers.push(connection.fetch.register(route))
  }

  try {
    register({
      path: '/api/cicd/credentials/registry',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const credentials = getCredentials()
          if (!credentials) throw new CicdError('CREDENTIALS_UNAVAILABLE', 'DSH credentials service is unavailable', 503)
          if (request.method === 'GET') {
            const [user, pass] = await Promise.all([
              credentials.describe(REGISTRY_USERNAME_REF),
              credentials.describe(REGISTRY_PASSWORD_REF),
            ])
            return json({
              configured: user.configured && pass.configured,
              writable: user.writable && pass.writable,
              usernameConfigured: user.configured,
              passwordConfigured: pass.configured,
              refs: [REGISTRY_USERNAME_REF, REGISTRY_PASSWORD_REF],
            })
          }
          const payload = await body(request)
          if (payload.clear === true) {
            await credentials.unset(REGISTRY_USERNAME_REF)
            await credentials.unset(REGISTRY_PASSWORD_REF)
            return json({ configured: false })
          }
          const username = typeof payload.username === 'string' ? payload.username.trim() : ''
          const password = typeof payload.password === 'string' ? payload.password : ''
          if (!username || username.length > 500) throw new CicdError('INVALID_INPUT', 'registry username is invalid', 400)
          if (!password || password.length > 4000) throw new CicdError('INVALID_INPUT', 'registry password is invalid', 400)
          await credentials.set(REGISTRY_USERNAME_REF, username)
          await credentials.set(REGISTRY_PASSWORD_REF, password)
          return json({ configured: true })
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/credentials/ssh',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const credentials = getCredentials()
          if (!credentials) throw new CicdError('CREDENTIALS_UNAVAILABLE', 'DSH credentials service is unavailable', 503)
          if (request.method === 'GET') {
            const info = await credentials.describe(SSH_PASSWORD_REF)
            return json({ configured: info.configured, writable: info.writable, source: info.source ?? null, ref: SSH_PASSWORD_REF })
          }
          const payload = await body(request)
          if (payload.clear === true) {
            await credentials.unset(SSH_PASSWORD_REF)
            return json({ configured: false })
          }
          const password = typeof payload.password === 'string' ? payload.password : ''
          if (password.length < 1 || password.length > 2000) throw new CicdError('INVALID_INPUT', 'SSH password is empty or too long', 400)
          await credentials.set(SSH_PASSWORD_REF, password)
          const info = await credentials.describe(SSH_PASSWORD_REF)
          if (!info.configured) throw new CicdError('CREDENTIALS_UNAVAILABLE', 'credential store did not report the SSH password as configured', 500)
          return json({ configured: true, source: info.source ?? null })
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/runner/profile',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          if (request.method === 'GET') {
            return json({ profile: store.getRunnerProfile('default') ?? null })
          }
          const config = configOf(await body(request))
          store.saveRunnerProfile('default', { ...config }, Date.now())
          onProfileSaved?.()
          return json({ profile: config })
        } catch (error) {
          return fail(error)
        }
      },
    })

    register({
      path: '/api/cicd/runners',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => json({
        runners: [{
          kind: 'ssh',
          transportAvailable: Boolean(getProcessRunner()),
          configured: false,
          reason: getProcessRunner()
            ? 'OpenSSH adapter is loaded; provide build host configuration and run preflight'
            : 'ctx.subprocess is unavailable; SSH transport cannot start',
        }],
      }),
    })

    register({
      path: '/api/cicd/runner/preflight',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const processRunner = getProcessRunner()
          if (!processRunner) throw new CicdError('RUNNER_UNAVAILABLE', 'ctx.subprocess is unavailable', 503)
          const config = configOf(await body(request))
          const credentials = getCredentials()
          const runner = new SshBuildRunner(processRunner, async () => {
            if (!config.passwordRef) return undefined
            if (!credentials) throw new CicdError('CREDENTIALS_UNAVAILABLE', 'DSH credentials service is unavailable', 503)
            const hit = await credentials.resolve(config.passwordRef)
            return hit?.value
          })
          const preflight = await runner.preflight(config)
          return json(preflight)
        } catch (error) {
          return fail(error)
        }
      },
    })
  } catch (error) {
    logger.warn(`Runner routes not registered: ${error instanceof Error ? error.message : String(error)}`)
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
