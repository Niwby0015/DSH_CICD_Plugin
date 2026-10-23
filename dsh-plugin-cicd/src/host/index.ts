import { appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Config, normalizeConfig } from './config.js'
import { PipelineService } from './domain/pipeline-service.js'
import { RunExecutor } from './execution/run-executor.js'
import { GitAuth } from './git/auth.js'
import { GitService } from './git/git-service.js'
import { SubprocessRunner } from './git/process.js'
import type { CredentialsService, HostContext } from './plugin-context.js'
import { registerGitRoutes, GITHUB_TOKEN_REF } from './routes/git.js'
import { registerBuildRoutes } from './routes/build.js'
import { registerRunnerRoutes } from './routes/runner.js'
import { registerRoutes } from './routes/index.js'
import { openStore } from './store/sqlite-store.js'
import { makeLogger } from './util/logger.js'
import { resolveDatabasePath, resolveDataDir } from './util/paths.js'

export const name = 'dsh-cicd'
export { Config }

/**
 * Host half of the CI/CD plugin. P0/P1 owns the durable control plane: pipeline
 * definitions, run/stage records, recovery, and the authenticated read/CRUD
 * routes the Web page uses. Execution is intentionally not faked.
 */
export function apply(ctx: HostContext, config?: unknown): void {
  const cfg = normalizeConfig(config)
  if (!cfg.enabled) return

  const logger = makeLogger(ctx)
  const dataDir = resolveDataDir(cfg)
  const databasePath = resolveDatabasePath(cfg)
  const store = openStore({ databasePath, logger, maxRuns: cfg.maxRuns })
  store.prune(cfg.maxRuns)
  const interrupted = store.reconcileInterrupted()
  if (interrupted > 0) logger.warn(`recovered ${interrupted} run(s) from a previous DSH process`)

  try {
    const snapshot = store.listPipelines(5).map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
      deploy: pipeline.deploy,
      updatedAt: pipeline.updatedAt,
    }))
    appendFileSync(
      join(tmpdir(), 'dsh-cicd-debug.log'),
      `${new Date().toISOString()} host=0.8.6 db=${databasePath} ${JSON.stringify(snapshot)}\n`,
      'utf8',
    )
  } catch {
    // diagnostics only
  }

  const service = new PipelineService({ store })
  let credentials: CredentialsService | undefined
  let git: GitService | undefined
  let workspaceRegistry: import('./plugin-context.js').WorkspaceRegistryService | undefined
  let processRunner: SubprocessRunner | undefined
  let routes: ReturnType<typeof registerRoutes> | undefined
  let gitRoutes: ReturnType<typeof registerGitRoutes> | undefined
  let buildRoutes: ReturnType<typeof registerBuildRoutes> | undefined
  let runnerRoutes: ReturnType<typeof registerRunnerRoutes> | undefined
  const executor = new RunExecutor(store, service, () => processRunner, () => credentials)
  service.setRunStarter(executor)
  service.setRunCanceller(executor)

  const markRunnerReady = (): void => {
    if (!processRunner || !store.getRunnerProfile('default')) return
    service.setCapability('sshRunner', {
      available: true,
      reason: 'SSH runner profile is saved; preflight and source/build/image execution are available',
    })
    service.setCapability('pipelineExecution', {
      available: true,
      reason: 'P4/P5/P6 execution: source, build/test, image, push; kubectl Deployment and rollout when kubeconfig is available',
    })
  }
  markRunnerReady()

  const getToken = async (): Promise<string | undefined> => {
    if (!credentials) return undefined
    const hit = await credentials.resolve(GITHUB_TOKEN_REF)
    return hit?.value
  }

  const offCredentials = ctx.inject
    ? ctx.inject(['credentials'], (scope) => {
        credentials = scope.credentials
        return () => {
          credentials = undefined
        }
      })
    : undefined

  const offWorkspaces = ctx.inject
    ? ctx.inject(['workspaceRegistry'], (scope) => {
        workspaceRegistry = scope.workspaceRegistry
        return () => {
          workspaceRegistry = undefined
        }
      })
    : undefined

  const offSubprocess = ctx.inject
    ? ctx.inject(['subprocess'], (scope) => {
        if (!scope.subprocess) {
          logger.warn('ctx.subprocess is unavailable; Git execution is disabled')
          return () => {}
        }
        const subprocessRunner = new SubprocessRunner(scope.subprocess)
        processRunner = subprocessRunner
        markRunnerReady()
        git = new GitService({
          runner: subprocessRunner,
          auth: new GitAuth(getToken),
        })
        service.setCapability('git', {
          available: true,
          reason: 'Local Git via ctx.subprocess; status, preview, commit and push are enabled',
        })
        logger.info('Git execution enabled via ctx.subprocess')
        return () => {
          git = undefined
          processRunner = undefined
          service.setCapability('git', {
            available: false,
            reason: 'ctx.subprocess is no longer mounted',
          })
          service.setCapability('sshRunner', {
            available: false,
            reason: 'ctx.subprocess is no longer mounted',
          })
          service.setCapability('pipelineExecution', {
            available: false,
            reason: 'ctx.subprocess is no longer mounted',
          })
        }
      })
    : undefined

  const offRoutes = ctx.inject
    ? ctx.inject(['connection'], (scope) => {
        try {
          routes = registerRoutes({ ctx: scope, service, logger })
          gitRoutes = registerGitRoutes({
            ctx: scope,
            service,
            getGit: () => git,
            getCredentials: () => credentials,
            getWorkspaces: () =>
              (workspaceRegistry?.list() ?? []).map((workspace) => ({
                path: workspace.path,
                title: workspace.title,
              })),
            logger,
          })
          buildRoutes = registerBuildRoutes({ ctx: scope, logger })
          runnerRoutes = registerRunnerRoutes({
            ctx: scope,
            store,
            getProcessRunner: () => processRunner,
            getCredentials: () => credentials,
            onProfileSaved: markRunnerReady,
            logger,
          })
        } catch (error) {
          logger.warn(`page routes unavailable: ${error instanceof Error ? error.message : String(error)}`)
        }
        return () => {
          routes?.dispose()
          routes = undefined
          gitRoutes?.dispose()
          gitRoutes = undefined
          buildRoutes?.dispose()
          buildRoutes = undefined
          runnerRoutes?.dispose()
          runnerRoutes = undefined
        }
      })
    : undefined

  logger.info(
    `activated: data=${dataDir} db=${databasePath} pipelines=${store.counts().pipelines} execution=not-ready`,
  )

  const cleanup = () => {
    try {
      offRoutes?.()
    } catch {
      // ignore
    }
    try {
      routes?.dispose()
    } catch {
      // ignore
    }
    try {
      gitRoutes?.dispose()
    } catch {
      // ignore
    }
    try {
      offSubprocess?.()
      offCredentials?.()
      offWorkspaces?.()
    } catch {
      // ignore
    }
    try {
      store.close()
    } catch {
      // ignore
    }
  }

  if (ctx.effect) ctx.effect(() => cleanup)
  else {
    // Test harnesses and non-Cordis callers may not provide effect; still make
    // cleanup available through the returned route disposer.
  }
}
