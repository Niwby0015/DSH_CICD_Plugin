/** Language families supported by the build planner. */
export type LanguageKind =
  | 'auto'
  | 'java-maven'
  | 'java-gradle'
  | 'node'
  | 'python'
  | 'go'
  | 'custom'

/** Deployment strategy selected for a pipeline. */
export type DeployStrategy = 'auto' | 'helm' | 'kubectl' | 'template'

/** Build settings persisted with a pipeline. Commands are reviewed, not auto-guessed at run time. */
export interface BuildConfig {
  tool: string
  version: string
  workingDir: string
  installCommand: string
  buildCommand: string
  testCommand: string
  dockerfilePath: string
}

export const EMPTY_BUILD_CONFIG: BuildConfig = {
  tool: '',
  version: '',
  workingDir: '',
  installCommand: '',
  buildCommand: '',
  testCommand: '',
  dockerfilePath: '',
}

export interface DeployConfig {
  containerPort: number
  servicePort: number
  serviceType: 'ClusterIP' | 'NodePort'
  replicas: number
  healthPath: string
  ingressHost: string
  ingressClass: string
  imagePullSecret: string
}

export const EMPTY_DEPLOY_CONFIG: DeployConfig = {
  containerPort: 8080,
  servicePort: 80,
  serviceType: 'ClusterIP',
  replicas: 1,
  healthPath: '/',
  ingressHost: '',
  ingressClass: '',
  imagePullSecret: '',
}

/** A stable, non-secret pipeline definition. Secrets are referenced by id elsewhere. */
export interface PipelineDefinition {
  id: string
  name: string
  description: string
  projectPath: string
  projectSubdir: string
  repoUrl: string
  branch: string
  language: LanguageKind
  build: BuildConfig
  deploy: DeployConfig
  imageRepository: string
  imageTagTemplate: string
  targetEnvironment: string
  namespace: string
  releaseName: string
  deployStrategy: DeployStrategy
  runnerKind: 'ssh'
  createdAt: number
  updatedAt: number
}

export type PipelineStatus = 'draft' | 'ready' | 'blocked'

export interface PipelineSummary extends PipelineDefinition {
  status: PipelineStatus
  runCount: number
  lastRun: RunSummary | null
}

/** Input accepted from the UI. The server owns id and timestamps. */
export interface PipelineDraft {
  name: string
  description?: string
  projectPath?: string
  projectSubdir?: string
  repoUrl?: string
  branch?: string
  language?: LanguageKind
  build?: Partial<BuildConfig>
  deploy?: Partial<DeployConfig>
  imageRepository?: string
  imageTagTemplate?: string
  targetEnvironment?: string
  namespace?: string
  releaseName?: string
  deployStrategy?: DeployStrategy
}

export type StageStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'interrupted'

export type RunStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'succeeded'
  | 'failed'
  | 'cancelling'
  | 'cancelled'
  | 'interrupted'

export type StageKey = 'source' | 'build' | 'image' | 'push' | 'deploy' | 'verify' | 'report'

export interface StageDefinition {
  key: StageKey
  order: number
  primary: boolean
  /** Shown in the graph as the short node label. */
  group: 'source' | 'build' | 'image' | 'push' | 'deploy' | 'verify' | 'report'
}

export interface RunStageRecord {
  runId: string
  key: StageKey
  ordinal: number
  status: StageStatus
  startedAt: number | null
  finishedAt: number | null
  exitCode: number | null
  errorCode: string | null
  errorMessage: string | null
  detail: Record<string, unknown>
}

export interface RunRecord {
  id: string
  pipelineId: string
  trigger: 'ui' | 'agent' | 'schedule'
  status: RunStatus
  commitSha: string
  branch: string
  imageRef: string
  imageDigest: string
  runnerKind: string
  targetEnvironment: string
  namespace: string
  planHash: string
  errorCode: string
  errorMessage: string
  cleanupState: 'not_started' | 'running' | 'succeeded' | 'failed' | 'unknown'
  cleanupMessage: string
  startedAt: number | null
  finishedAt: number | null
  createdAt: number
}

export type RunSummary = Pick<
  RunRecord,
  'id' | 'pipelineId' | 'status' | 'commitSha' | 'imageRef' | 'runnerKind' | 'targetEnvironment' | 'createdAt' | 'finishedAt'
>

export interface RunDetail {
  run: RunRecord
  pipelineName: string
  stages: RunStageRecord[]
}

export interface LogRecord {
  seq: number
  ts: number
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export interface Capability {
  available: boolean
  reason: string
}

export interface Capabilities {
  storage: Capability & { backend: 'sqlite'; path: string; schemaVersion: number }
  git: Capability
  sshRunner: Capability
  pipelineExecution: Capability
}

export interface BootstrapPayload {
  generatedAt: number
  definitions: StageDefinition[]
  capabilities: Capabilities
  counts: { pipelines: number; runs: number; running: number; environments: number }
  pipelines: PipelineSummary[]
  runs: RunSummary[]
}

export interface PipelineDetailPayload {
  pipeline: PipelineSummary
  definitions: StageDefinition[]
  runs: RunSummary[]
}

export interface SavePipelinePayload {
  pipeline: PipelineSummary
  created: boolean
}
