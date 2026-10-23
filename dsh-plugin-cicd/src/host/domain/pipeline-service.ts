import { isAbsolute } from 'node:path'
import type { CicdStore } from '../store/sqlite-store.js'
import { CicdError } from '../util/errors.js'
import { createId } from '../util/id.js'
import { initialStages, isStageKey, STAGE_DEFINITIONS } from './stage-definitions.js'
import { assertRunTransition, assertStageTransition } from './state-machine.js'
import type {
  BootstrapPayload,
  BuildConfig,
  Capabilities,
  Capability,
  DeployConfig,
  DeployStrategy,
  LanguageKind,
  PipelineDefinition,
  PipelineDetailPayload,
  PipelineDraft,
  PipelineSummary,
  RunDetail,
  RunRecord,
  RunStageRecord,
  RunStatus,
  RunSummary,
  SavePipelinePayload,
  StageKey,
  StageStatus,
} from './types.js'

const LANGUAGES = new Set<LanguageKind>(['auto', 'java-maven', 'java-gradle', 'node', 'python', 'go', 'custom'])
const STRATEGIES = new Set<DeployStrategy>(['auto', 'helm', 'kubectl', 'template'])
const BRANCH_RE = /^[A-Za-z0-9._/-]+$/
const NAMESPACE_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
const RELEASE_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
const ACTIVE_RUN_STATUSES = new Set<RunStatus>(['queued', 'running', 'awaiting_approval', 'cancelling'])
const TOOL_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/
const RELATIVE_PATH_RE = /^[A-Za-z0-9._/-]*$/

function normalizeBuild(input: Partial<BuildConfig> | undefined): BuildConfig {  const raw = input ?? {}
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
  const tool = text(raw.tool, 41)
  const version = text(raw.version, 41)
  const workingDir = text(raw.workingDir, 200).replaceAll('\\', '/')
  const dockerfilePath = text(raw.dockerfilePath, 300).replaceAll('\\', '/')
  if (tool && !TOOL_RE.test(tool)) throw new CicdError('INVALID_INPUT', 'build.tool contains unsupported characters', 400)
  if (version && !VERSION_RE.test(version)) throw new CicdError('INVALID_INPUT', 'build.version contains unsupported characters', 400)
  for (const [name, value] of [['workingDir', workingDir], ['dockerfilePath', dockerfilePath]] as const) {
    if (!value) continue
    if (value.startsWith('/') || /^[A-Za-z]:/.test(value) || !RELATIVE_PATH_RE.test(value) || value.split('/').includes('..')) {
      throw new CicdError('INVALID_INPUT', `build.${name} must be a relative path inside the project`, 400)
    }
  }
  const command = (value: unknown, max: number) => {
    const result = text(value, max)
    if (result.includes('\0') || result.includes('\n') || result.includes('\r')) {
      throw new CicdError('INVALID_INPUT', 'build commands must be single-line', 400)
    }
    return result
  }
  return {
    tool,
    version,
    workingDir,
    installCommand: command(raw.installCommand, 2000),
    buildCommand: command(raw.buildCommand, 2000),
    testCommand: command(raw.testCommand, 2000),
    dockerfilePath,
  }
}

function normalizeDeploy(input: Partial<DeployConfig> | undefined): DeployConfig {
  const raw = input ?? {}
  const port = (value: unknown, fallback: number): number => {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback
  }
  const replicas = port(raw.replicas, 1)
  if (replicas > 10) throw new CicdError('INVALID_INPUT', 'deploy.replicas must be between 1 and 10', 400)
  const serviceType = raw.serviceType === 'NodePort' ? 'NodePort' : 'ClusterIP'
  const healthPath = trim(raw.healthPath, 200) || '/'
  if (!healthPath.startsWith('/') || /[\s\x00]/.test(healthPath)) {
    throw new CicdError('INVALID_INPUT', 'deploy.healthPath must start with / and contain no whitespace', 400)
  }
  const ingressHost = trim(raw.ingressHost, 253).toLowerCase()
  if (ingressHost && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(ingressHost)) {
    throw new CicdError('INVALID_INPUT', 'deploy.ingressHost is not a valid DNS host', 400)
  }
  const ingressClass = trim(raw.ingressClass, 63)
  const imagePullSecret = trim(raw.imagePullSecret, 63)
  for (const [name, value] of [['ingressClass', ingressClass], ['imagePullSecret', imagePullSecret]] as const) {
    if (value && !RELEASE_RE.test(value)) {
      throw new CicdError('INVALID_INPUT', `deploy.${name} must be a lowercase DNS label`, 400)
    }
  }
  return {
    containerPort: port(raw.containerPort, 8080),
    servicePort: port(raw.servicePort, 80),
    serviceType,
    replicas,
    healthPath,
    ingressHost,
    ingressClass,
    imagePullSecret,
  }
}

export interface PipelineServiceOptions {  store: CicdStore
  now?: () => number
  id?: (prefix: string) => string
}

function trim(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function assertRepoUrl(value: string): void {
  if (!value) return
  if (/^[^@\s]+@[^:\s]+:.+$/.test(value)) return
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new CicdError('INVALID_INPUT', 'repoUrl must be an http(s), ssh, or git@ URL', 400)
  }
  if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) {
    throw new CicdError('INVALID_INPUT', `unsupported repository protocol: ${url.protocol}`, 400)
  }
  if (url.username || url.password) {
    throw new CicdError('INVALID_INPUT', 'do not put credentials in the repository URL', 400)
  }
}

function normalizeDraft(input: PipelineDraft): Omit<PipelineDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const name = trim(input.name, 80)
  if (!name) throw new CicdError('INVALID_INPUT', 'pipeline name is required', 400)
  const projectPath = trim(input.projectPath, 500)
  if (projectPath && !isAbsolute(projectPath)) {
    throw new CicdError('INVALID_INPUT', 'projectPath must be absolute', 400)
  }
  const repoUrl = trim(input.repoUrl, 500)
  assertRepoUrl(repoUrl)
  const branch = trim(input.branch, 200) || 'main'
  if (!BRANCH_RE.test(branch) || branch.includes('..')) {
    throw new CicdError('INVALID_INPUT', 'branch contains unsupported characters', 400)
  }
  const language = (input.language ?? 'auto') as LanguageKind
  if (!LANGUAGES.has(language)) throw new CicdError('INVALID_INPUT', 'unsupported language', 400)
  const deployStrategy = (input.deployStrategy ?? 'auto') as DeployStrategy
  if (!STRATEGIES.has(deployStrategy)) throw new CicdError('INVALID_INPUT', 'unsupported deploy strategy', 400)
  const namespace = trim(input.namespace, 63)
  if (namespace && !NAMESPACE_RE.test(namespace)) {
    throw new CicdError('INVALID_INPUT', 'namespace must be a lowercase DNS label', 400)
  }
  const releaseName = trim(input.releaseName, 53)
  if (releaseName && !RELEASE_RE.test(releaseName)) {
    throw new CicdError('INVALID_INPUT', 'releaseName must be a lowercase DNS label', 400)
  }
  return {
    name,
    description: trim(input.description, 500),
    projectPath,
    projectSubdir: trim(input.projectSubdir, 200),
    repoUrl,
    branch,
    language,
    build: normalizeBuild(input.build),
    deploy: normalizeDeploy(input.deploy),
    imageRepository: trim(input.imageRepository, 300),
    imageTagTemplate: trim(input.imageTagTemplate, 120) || 'sha-{sha7}',
    targetEnvironment: trim(input.targetEnvironment, 80),
    namespace,
    releaseName,
    deployStrategy,
    runnerKind: 'ssh',
  }
}

function statusFor(definition: PipelineDefinition): PipelineSummary['status'] {
  if (!definition.projectPath || !definition.repoUrl) return 'draft'
  if (definition.language === 'auto') return 'draft'
  if (definition.language === 'custom' && !definition.build.buildCommand && !definition.build.testCommand) return 'draft'
  return 'ready'
}

export interface RunStarter {
  start(run: RunDetail, pipeline: PipelineDefinition): void
}

export interface RunCanceller {
  cancel(runId: string): boolean
}

export class PipelineService {
  private readonly store: CicdStore
  private readonly now: () => number
  private readonly id: (prefix: string) => string
  private readonly capabilityOverrides: Partial<Capabilities> = {}
  private runStarter: RunStarter | undefined
  private runCanceller: RunCanceller | undefined

  constructor(options: PipelineServiceOptions) {
    this.store = options.store
    this.now = options.now ?? (() => Date.now())
    this.id = options.id ?? createId
  }

  setCapability(key: 'git' | 'sshRunner' | 'pipelineExecution', capability: Capability): void {
    this.capabilityOverrides[key] = capability
  }

  setRunStarter(starter: RunStarter): void {
    this.runStarter = starter
  }

  setRunCanceller(canceller: RunCanceller): void {
    this.runCanceller = canceller
  }

  cancelRun(runId: string): RunDetail {
    const run = this.store.getRun(runId)
    if (!run) throw new CicdError('NOT_FOUND', 'run not found', 404)
    if (run.status === 'cancelled') return this.runDetail(runId)
    if (run.status === 'queued') {
      for (const stage of this.store.getStages(runId)) {
        if (stage.status === 'pending') this.transitionStage(runId, stage.key, 'cancelled', { finishedAt: this.now() })
      }
      this.transitionRun(runId, 'cancelled', {
        finishedAt: this.now(),
        errorCode: 'CANCELLED',
        errorMessage: 'run cancelled before execution',
        cleanupState: 'not_started',
      })
      return this.runDetail(runId)
    }
    if (run.status === 'running') {
      if (!this.runCanceller) throw new CicdError('EXECUTION_NOT_READY', 'run cancellation is not wired', 501)
      this.transitionRun(runId, 'cancelling')
      if (!this.runCanceller.cancel(runId)) {
        throw new CicdError('CONFLICT', 'run has no active executor to cancel', 409)
      }
      return this.runDetail(runId)
    }
    if (run.status === 'cancelling') return this.runDetail(runId)
    throw new CicdError('CONFLICT', `run cannot be cancelled from ${run.status}`, 409)
  }

  createPipeline(draft: PipelineDraft): SavePipelinePayload {
    const normalized = normalizeDraft(draft)
    const now = this.now()
    const record: PipelineDefinition = {
      ...normalized,
      id: this.id('pl'),
      createdAt: now,
      updatedAt: now,
    }
    this.store.createPipeline(record)
    return { pipeline: this.summary(record), created: true }
  }

  updatePipeline(id: string, draft: PipelineDraft): SavePipelinePayload {
    const current = this.requirePipeline(id)
    const normalized = normalizeDraft({
      name: draft.name || current.name,
      description: draft.description ?? current.description,
      projectPath: draft.projectPath ?? current.projectPath,
      projectSubdir: draft.projectSubdir ?? current.projectSubdir,
      repoUrl: draft.repoUrl ?? current.repoUrl,
      branch: draft.branch ?? current.branch,
      language: draft.language ?? current.language,
      build: draft.build ?? current.build,
      deploy: draft.deploy ?? current.deploy,
      imageRepository: draft.imageRepository ?? current.imageRepository,
      imageTagTemplate: draft.imageTagTemplate ?? current.imageTagTemplate,
      targetEnvironment: draft.targetEnvironment ?? current.targetEnvironment,
      namespace: draft.namespace ?? current.namespace,
      releaseName: draft.releaseName ?? current.releaseName,
      deployStrategy: draft.deployStrategy ?? current.deployStrategy,
    })
    const record: PipelineDefinition = {
      ...current,
      ...normalized,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: this.now(),
    }
    this.store.updatePipeline(record)
    return { pipeline: this.summary(record), created: false }
  }

  deletePipeline(id: string): void {
    this.requirePipeline(id)
    const active = this.store.listRuns(20, id).find((run) => ACTIVE_RUN_STATUSES.has(run.status))
    if (active) throw new CicdError('CONFLICT', `pipeline has an active run: ${active.id}`, 409)
    if (!this.store.deletePipeline(id)) throw new CicdError('NOT_FOUND', 'pipeline not found', 404)
  }

  listPipelines(limit = 100): PipelineSummary[] {
    return this.store.listPipelines(limit).map((definition) => this.summary(definition))
  }

  getPipeline(id: string): PipelineSummary {
    return this.summary(this.requirePipeline(id))
  }

  detail(id: string): PipelineDetailPayload {
    const pipeline = this.getPipeline(id)
    return {
      pipeline,
      definitions: [...STAGE_DEFINITIONS],
      runs: this.store.listRuns(30, id),
    }
  }

  listRuns(limit = 50, pipelineId?: string): RunSummary[] {
    if (pipelineId) this.requirePipeline(pipelineId)
    return this.store.listRuns(limit, pipelineId)
  }

  runDetail(id: string): RunDetail {
    const run = this.store.getRun(id)
    if (!run) throw new CicdError('NOT_FOUND', 'run not found', 404)
    const pipeline = this.store.getPipeline(run.pipelineId)
    return {
      run,
      pipelineName: pipeline?.name ?? '(deleted pipeline)',
      stages: this.store.getStages(id),
    }
  }

  listLogs(runId: string, stageKey?: string, after = 0, limit = 500) {
    if (!this.store.getRun(runId)) throw new CicdError('NOT_FOUND', 'run not found', 404)
    if (stageKey && !isStageKey(stageKey)) throw new CicdError('INVALID_INPUT', 'unknown stage', 400)
    return this.store.listLogs(runId, stageKey as StageKey | undefined, after, limit)
  }

  /** Internal seam for the P2+ orchestrator and for persistence tests. */
  createQueuedRun(
    pipelineId: string,
    input: { commitSha: string; branch?: string; trigger?: RunRecord['trigger'] } = { commitSha: '' },
  ): RunDetail {
    const pipeline = this.requirePipeline(pipelineId)
    const active = this.store.listRuns(20, pipelineId).find((run) => ACTIVE_RUN_STATUSES.has(run.status))
    if (active) throw new CicdError('CONFLICT', `pipeline already has an active run: ${active.id}`, 409)
    const now = this.now()
    const run: RunRecord = {
      id: this.id('run'),
      pipelineId,
      trigger: input.trigger ?? 'ui',
      status: 'queued',
      commitSha: input.commitSha,
      branch: input.branch ?? pipeline.branch,
      imageRef: '',
      imageDigest: '',
      runnerKind: pipeline.runnerKind,
      targetEnvironment: pipeline.targetEnvironment,
      namespace: pipeline.namespace,
      planHash: '',
      errorCode: '',
      errorMessage: '',
      cleanupState: 'not_started',
      cleanupMessage: '',
      startedAt: null,
      finishedAt: null,
      createdAt: now,
    }
    this.store.createRun(run, initialStages(), pipeline)
    return this.runDetail(run.id)
  }

  startRun(pipelineId: string): RunDetail {
    if (!this.runStarter) {
      throw new CicdError(
        'EXECUTION_NOT_READY',
        'execution is not wired; configure an SSH build host and restart the Host',
        501,
      )
    }
    const pipeline = this.requirePipeline(pipelineId)
    if (!pipeline.projectPath) throw new CicdError('INVALID_INPUT', 'pipeline projectPath is empty', 400)
    const run = this.createQueuedRun(pipelineId)
    this.runStarter.start(run, pipeline)
    return run
  }

  transitionStage(runId: string, key: string, status: StageStatus, patch: Partial<RunStageRecord> = {}): void {
    if (!isStageKey(key)) throw new CicdError('INVALID_INPUT', 'unknown stage', 400)
    const stage = this.store.getStages(runId).find((item) => item.key === key)
    if (!stage) throw new CicdError('NOT_FOUND', 'stage not found', 404)
    assertStageTransition(stage.status, status)
    this.store.updateStage(runId, key, { ...patch, status })
  }

  transitionRun(runId: string, status: RunStatus, patch: Partial<RunRecord> = {}): void {
    const run = this.store.getRun(runId)
    if (!run) throw new CicdError('NOT_FOUND', 'run not found', 404)
    assertRunTransition(run.status, status)
    this.store.updateRun(runId, { ...patch, status })
  }

  capabilities(): Capabilities {
    const storage = this.store.status()
    return {
      storage: {
        available: true,
        reason: 'SQLite WAL database, private to this plugin',
        ...storage,
      },
      git: this.capabilityOverrides.git ?? {
        available: false,
        reason: 'Git 状态、提交和推送将在 P2 接入',
      },
      sshRunner: this.capabilityOverrides.sshRunner ?? {
        available: false,
        reason: 'SSH Runner 将在 P4 接入',
      },
      pipelineExecution: this.capabilityOverrides.pipelineExecution ?? {
        available: false,
        reason: '阶段执行将在 P2–P6 逐步接入；当前不会创建虚假运行',
      },
    }
  }

  bootstrap(): BootstrapPayload {
    const pipelines = this.listPipelines(50)
    return {
      generatedAt: this.now(),
      definitions: [...STAGE_DEFINITIONS],
      capabilities: this.capabilities(),
      counts: this.store.counts(),
      pipelines,
      runs: this.store.listRuns(30),
    }
  }

  private requirePipeline(id: string): PipelineDefinition {
    const pipeline = this.store.getPipeline(id)
    if (!pipeline) throw new CicdError('NOT_FOUND', 'pipeline not found', 404)
    return pipeline
  }

  private summary(definition: PipelineDefinition): PipelineSummary {
    return {
      ...definition,
      status: statusFor(definition),
      runCount: this.store.pipelineRunCount(definition.id),
      lastRun: this.store.lastRun(definition.id) ?? null,
    }
  }
}
