import type { CredentialsService } from '../plugin-context.js'
import type { CicdStore } from '../store/sqlite-store.js'
import type { PipelineDefinition, RunDetail, RunRecord, StageKey } from '../domain/types.js'
import type { PipelineService } from '../domain/pipeline-service.js'
import type { ProcessRunner } from '../git/process.js'
import { createBuildPlan } from '../language/planner.js'
import { renderManifests } from '../deploy/manifests.js'
import type { SshRunnerConfig } from '../runner/types.js'
import { SshBuildRunner } from '../runner/ssh/ssh-runner.js'
import { redactText } from '../security/redactor.js'
import { CicdError } from '../util/errors.js'

const PASSWORD_REF = 'DSH_CICD_SSH_PASSWORD'

function now(): number {
  return Date.now()
}

function kubernetesName(value: string, fallback: string): string {
  const normalized = (value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
  return normalized || fallback
}

/**
 * P4/P5/P6 executor. It only marks a stage succeeded after the corresponding
 * remote action returned success; unavailable capabilities are skipped or fail
 * explicitly.
 */
export class RunExecutor {
  private readonly controllers = new Map<string, AbortController>()

  constructor(
    private readonly store: CicdStore,
    private readonly service: PipelineService,
    private readonly getProcessRunner: () => ProcessRunner | undefined,
    private readonly credentials: () => CredentialsService | undefined,
  ) {}

  start(run: RunDetail, pipeline: PipelineDefinition): void {
    void this.execute(run, pipeline).catch(() => {
      // execute records its own failure; this guard prevents an unhandled rejection.
    })
  }

  cancel(runId: string): boolean {
    const controller = this.controllers.get(runId)
    if (!controller) return false
    controller.abort(new Error('run cancelled by user'))
    return true
  }

  private transition(runId: string, key: StageKey, status: Parameters<PipelineService['transitionStage']>[2], patch: Parameters<PipelineService['transitionStage']>[3] = {}): void {
    try {
      this.service.transitionStage(runId, key, status, patch)
    } catch {
      // A late callback must not turn a recorded result into an unhandled error.
    }
  }

  private async execute(run: RunDetail, pipeline: PipelineDefinition): Promise<void> {
    const runId = run.run.id
    const initial = this.store.getRun(runId)
    if (!initial || ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(initial.status)) return
    const controller = new AbortController()
    this.controllers.set(runId, controller)
    let imageRef = ''
    let commitSha = ''
    try {
      this.service.transitionRun(runId, 'running', { startedAt: now() })
      const rawProfile = this.store.getRunnerProfile('default')
      if (!rawProfile) throw new CicdError('RUNNER_UNAVAILABLE', 'SSH build host is not configured', 503)
      const processRunner = this.getProcessRunner()
      if (!processRunner) throw new CicdError('RUNNER_UNAVAILABLE', 'ctx.subprocess is unavailable', 503)
      const profile = rawProfile as unknown as SshRunnerConfig
      if (profile.kind !== 'ssh' || !profile.host || !profile.user || !profile.knownHostsPath) {
        throw new CicdError('RUNNER_UNAVAILABLE', 'SSH build host configuration is incomplete', 503)
      }
      commitSha = await this.resolveCommit(pipeline)
      const plan = await createBuildPlan({
        projectPath: pipeline.projectPath,
        projectSubdir: pipeline.projectSubdir,
        language: pipeline.language,
        build: pipeline.build,
      })
      const tag = (pipeline.imageTagTemplate || 'sha-{sha7}')
        .replaceAll('{sha7}', commitSha.slice(0, 7))
        .replaceAll('{sha}', commitSha)
      imageRef = `${pipeline.imageRepository || `dsh-cicd/${pipeline.id}`}:${tag}`
      const workspace = `${(profile.workspaceRoot || '/tmp/dsh-cicd').replace(/\/+$/, '')}/run-${runId}`
      this.store.updateRun(runId, { commitSha, imageRef })
      this.transition(runId, 'source', 'running', { startedAt: now() })

      const credentials = this.credentials()
      const runner = new SshBuildRunner(processRunner, async () => {
        if (!credentials) return undefined
        const hit = await credentials.resolve(profile.passwordRef || PASSWORD_REF)
        return hit?.value
      })
      const result = await runner.build(profile, {
        runId: runId,
        projectPath: pipeline.projectPath,
        commitSha,
        workspace,
        buildPlan: plan,
        imageRef,
        onStage: (stage, status) => {
          if (status === 'running') {
            this.transition(runId, stage, 'running', { startedAt: now() })
          } else {
            this.transition(runId, stage, 'succeeded', { finishedAt: now() })
          }
        },
        onLog: (stage, stream, text) => {
          const cleaned = redactText(text)
          if (cleaned) this.store.appendLog(runId, stage, stream, cleaned.slice(0, 4000))
        },
      }, controller.signal)

      this.transition(runId, 'image', 'succeeded', {
        finishedAt: now(),
        detail: { imageRef: result.imageRef, imageDigest: result.imageDigest, workspace: result.workspace },
      })
      let pushedDigest = result.imageDigest
      if (pipeline.imageRepository) {
        this.transition(runId, 'push', 'running', { startedAt: now() })
        const credentialsService = this.credentials()
        if (!credentialsService) throw new CicdError('REGISTRY_AUTH_FAILED', 'DSH credentials service is unavailable', 503)
        const [user, pass] = await Promise.all([
          credentialsService.resolve('DSH_CICD_REGISTRY_USERNAME'),
          credentialsService.resolve('DSH_CICD_REGISTRY_PASSWORD'),
        ])
        if (!user?.value || !pass?.value) {
          throw new CicdError('REGISTRY_AUTH_FAILED', 'registry username/password are not configured in the Credentials tab', 401)
        }
        const pushed = await runner.pushImage(profile, result.imageRef, user.value, pass.value, controller.signal)
        for (const line of pushed.logs.slice(-100)) {
          this.store.appendLog(runId, 'push', 'stdout', redactText(line).slice(0, 4000))
        }
        if (!pushed.verified) {
          throw new CicdError('REGISTRY_PUSH_FAILED', 'registry digest could not be cross-verified after push', 502)
        }
        pushedDigest = pushed.digest
        this.transition(runId, 'push', 'succeeded', {
          finishedAt: now(),
          detail: { imageRef: pushed.imageRef, imageDigest: pushed.digest, verified: pushed.verified },
        })
      } else {
        this.transition(runId, 'push', 'skipped', { detail: { reason: 'imageRepository is empty; push skipped' } })
      }
      let deployed = false
      if (pipeline.imageRepository) {
        if (pipeline.deployStrategy !== 'auto' && pipeline.deployStrategy !== 'kubectl') {
          throw new CicdError('DEPLOY_UNSUPPORTED', `deploy strategy is not implemented: ${pipeline.deployStrategy}`, 501)
        }
        this.transition(runId, 'deploy', 'running', { startedAt: now() })
        const namespace = kubernetesName(pipeline.namespace, 'default')
        const deployment = kubernetesName(pipeline.releaseName, `dsh-cicd-${pipeline.id}`)
        // The tag already contains the commit SHA. Using the tag lets an
        // air-gapped/preloaded cluster resolve the image from containerd
        // without contacting the registry; the digest remains recorded on the
        // run and push stage for provenance.
        const image = result.imageRef
        const manifest = renderManifests({
          namespace,
          deployment,
          image,
          deploy: pipeline.deploy,
          environment: pipeline.targetEnvironment,
        })
        const resultDeploy = await runner.deployKubernetes(profile, {
          namespace,
          deployment,
          image,
          manifest,
          servicePort: pipeline.deploy.servicePort,
          healthPath: pipeline.deploy.healthPath,
          timeoutSeconds: 180,
          localPort: 18080 + Math.floor(Math.random() * 500),
        }, controller.signal)
        for (const line of resultDeploy.logs.slice(-100)) {
          this.store.appendLog(runId, 'deploy', 'stdout', redactText(line).slice(0, 4000))
        }
        this.transition(runId, 'deploy', 'succeeded', {
          finishedAt: now(),
          detail: {
            namespace,
            deployment,
            image,
            readyReplicas: resultDeploy.readyReplicas,
            desiredReplicas: resultDeploy.desiredReplicas,
          },
        })
        this.transition(runId, 'verify', 'running', { startedAt: now() })
        this.transition(runId, 'verify', 'succeeded', {
          finishedAt: now(),
          detail: {
            method: 'kubectl rollout status + HTTP health',
            readyReplicas: resultDeploy.readyReplicas,
            httpStatus: resultDeploy.httpStatus,
          },
        })
        deployed = true
      }
      if (!deployed) {
        this.transition(runId, 'deploy', 'skipped', { detail: { reason: 'no pushed image or unsupported target' } })
        this.transition(runId, 'verify', 'skipped', { detail: { reason: 'deploy was skipped' } })
      } else {
        const verifyStage = this.store.getStages(runId).find((stage) => stage.key === 'verify')
        if (verifyStage?.status !== 'succeeded') {
          this.transition(runId, 'verify', 'running', { startedAt: now() })
          this.transition(runId, 'verify', 'failed', { finishedAt: now(), errorMessage: 'verify did not complete after deploy' })
          throw new CicdError('VERIFY_INCOMPLETE', 'verify stage did not complete after deploy', 500)
        }
      }
      this.transition(runId, 'report', 'running', { startedAt: now() })
      this.transition(runId, 'report', 'succeeded', {
        finishedAt: now(),
        detail: {
          result: deployed
            ? 'source/build/image/push/deploy/verify completed'
            : pipeline.imageRepository
              ? 'source/build/image/push completed; deploy/verify skipped'
              : 'source/build/image completed; push/deploy/verify skipped',
        },
      })
      this.service.transitionRun(runId, 'succeeded', {
        finishedAt: now(),
        imageRef: result.imageRef,
        imageDigest: pushedDigest,
        cleanupState: 'succeeded',
        cleanupMessage: 'remote workspace cleaned',
      })
    } catch (error) {
      if (controller.signal.aborted) {
        const stages = this.store.getStages(runId)
        const activeStage = stages.find((stage) => stage.status === 'running')?.key
        if (activeStage) this.store.appendLog(runId, activeStage, 'stderr', 'run cancelled by user')
        for (const stage of stages) {
          if (stage.key === 'report') continue
          if (stage.status === 'running') this.transition(runId, stage.key, 'cancelled', { finishedAt: now() })
          if (stage.status === 'pending') this.transition(runId, stage.key, 'skipped')
        }
        const report = stages.find((stage) => stage.key === 'report')
        if (report?.status === 'pending') this.transition(runId, 'report', 'running', { startedAt: now() })
        if (report?.status === 'pending' || report?.status === 'running') {
          this.transition(runId, 'report', 'cancelled', { finishedAt: now(), detail: { result: 'cancelled by user' } })
        }
        try {
          const current = this.store.getRun(runId)
          if (current?.status === 'running') this.service.transitionRun(runId, 'cancelling')
          this.service.transitionRun(runId, 'cancelled', {
            finishedAt: now(),
            commitSha,
            imageRef,
            errorCode: 'CANCELLED',
            errorMessage: 'run cancelled by user',
            cleanupState: 'unknown',
            cleanupMessage: 'cancelled; remote cleanup was attempted but is not confirmed',
          })
        } catch {
          // keep stage state authoritative if another path already finalized the run
        }
        return
      }
      const message = redactText(error instanceof Error ? error.message : String(error))
      const stages = this.store.getStages(runId)
      const failedStage = stages.find((stage) => stage.status === 'running')?.key ?? 'build'
      this.store.appendLog(runId, failedStage, 'stderr', message.slice(0, 4000))
      for (const stage of stages) {
        if (stage.key === 'report') continue
        if (stage.status === 'running') this.transition(runId, stage.key, 'failed', { finishedAt: now(), errorMessage: message })
        if (stage.status === 'pending') this.transition(runId, stage.key, 'skipped')
      }
      this.transition(runId, 'report', 'running', { startedAt: now() })
      this.transition(runId, 'report', 'failed', { finishedAt: now(), errorMessage: message })
      try {
        this.service.transitionRun(runId, 'failed', {
          finishedAt: now(),
          commitSha,
          imageRef,
          errorCode: error instanceof CicdError ? error.code : 'EXECUTION_FAILED',
          errorMessage: message,
          cleanupState: 'succeeded',
        })
      } catch {
        // keep the recorded stages authoritative if the run was already terminal
      }
    } finally {
      this.controllers.delete(runId)
    }
  }

  private async resolveCommit(pipeline: PipelineDefinition): Promise<string> {
    if (!pipeline.projectPath) throw new CicdError('INVALID_INPUT', 'pipeline projectPath is empty', 400)
    const processRunner = this.getProcessRunner()
    if (!processRunner) throw new CicdError('RUNNER_UNAVAILABLE', 'ctx.subprocess is unavailable', 503)
    const branch = pipeline.branch || 'main'
    const result = await processRunner.run(['git', 'rev-parse', '--verify', `${branch}^{commit}`], {
      cwd: pipeline.projectPath,
      timeoutMs: 30_000,
    })
    if (result.code === 0 && /^[0-9a-f]{40}$/i.test(result.stdout.trim())) return result.stdout.trim()
    const head = await processRunner.run(['git', 'rev-parse', '--verify', 'HEAD'], {
      cwd: pipeline.projectPath,
      timeoutMs: 30_000,
    })
    if (head.code === 0 && /^[0-9a-f]{40}$/i.test(head.stdout.trim())) return head.stdout.trim()
    throw new CicdError('GIT_REF_NOT_FOUND', `cannot resolve commit for branch ${branch}`, 404)
  }
}


