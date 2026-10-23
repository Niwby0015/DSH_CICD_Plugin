import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initialStages } from '../../src/host/domain/stage-definitions.js'
import type { PipelineDefinition, RunRecord } from '../../src/host/domain/types.js'
import { EMPTY_DEPLOY_CONFIG } from '../../src/host/domain/types.js'
import { openStore, type CicdStore } from '../../src/host/store/sqlite-store.js'

const dirs: string[] = []
let store: CicdStore | undefined

function makeStore(): CicdStore {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-store-'))
  dirs.push(dir)
  return openStore({ databasePath: join(dir, 'cicd.db') })
}

function pipeline(id = 'pl_test'): PipelineDefinition {
  const now = Date.now()
  return {
    id,
    name: 'demo',
    description: '',
    projectPath: 'D:\\work\\demo',
    projectSubdir: '',
    repoUrl: 'https://github.com/acme/demo.git',
    branch: 'main',
    language: 'node',
    build: {
      tool: 'pnpm',
      version: '22',
      workingDir: '',
      installCommand: 'pnpm install --frozen-lockfile',
      buildCommand: 'pnpm run build',
      testCommand: 'pnpm test',
      dockerfilePath: 'Dockerfile',
    },
    deploy: { ...EMPTY_DEPLOY_CONFIG },
    imageRepository: 'registry.example.com/acme/demo',
    imageTagTemplate: 'sha-{sha7}',
    targetEnvironment: 'staging',
    namespace: 'demo-staging',
    releaseName: 'demo',
    deployStrategy: 'auto',
    runnerKind: 'ssh',
    createdAt: now,
    updatedAt: now,
  }
}

function run(id = 'run_test', status: RunRecord['status'] = 'queued'): RunRecord {
  return {
    id,
    pipelineId: 'pl_test',
    trigger: 'ui',
    status,
    commitSha: 'a'.repeat(40),
    branch: 'main',
    imageRef: '',
    imageDigest: '',
    runnerKind: 'ssh',
    targetEnvironment: 'staging',
    namespace: 'demo-staging',
    planHash: '',
    errorCode: '',
    errorMessage: '',
    cleanupState: 'not_started',
    cleanupMessage: '',
    startedAt: null,
    finishedAt: null,
    createdAt: Date.now(),
  }
}

afterEach(() => {
  try {
    store?.close()
  } catch {
    // ignore
  }
  store = undefined
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('sqlite store', () => {
  it('persists pipelines across a close/reopen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-store-'))
    dirs.push(dir)
    const path = join(dir, 'cicd.db')
    store = openStore({ databasePath: path })
    store.createPipeline(pipeline())
    expect(store.getPipeline('pl_test')?.name).toBe('demo')
    expect(store.counts().pipelines).toBe(1)
    store.close()
    store = openStore({ databasePath: path })
    expect(store.getPipeline('pl_test')?.repoUrl).toBe('https://github.com/acme/demo.git')
    expect(store.getPipeline('pl_test')?.build.installCommand).toBe('pnpm install --frozen-lockfile')
    expect(store.getPipeline('pl_test')?.deploy.containerPort).toBe(8080)
    expect(store.status().schemaVersion).toBe(2)
  })

  it('roundtrips a non-default nested deploy config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-store-deploy-'))
    dirs.push(dir)
    const store = openStore({ databasePath: join(dir, 'cicd.db') })
    store.createPipeline({
      ...pipeline(),
      deploy: { ...EMPTY_DEPLOY_CONFIG, containerPort: 5006, servicePort: 8080, ingressHost: 'sample.example.com' },
    })
    const got = store.getPipeline('pl_test')
    expect(got?.deploy.containerPort).toBe(5006)
    expect(got?.deploy.servicePort).toBe(8080)
    expect(got?.deploy.ingressHost).toBe('sample.example.com')
    store.close()
  })

  it('persists a non-secret runner profile', () => {
    store = makeStore()
    expect(store.getRunnerProfile()).toBeUndefined()
    store.saveRunnerProfile('default', {
      kind: 'ssh',
      host: 'build.example.com',
      port: 22,
      user: 'deploy',
      auth: 'password',
      knownHostsPath: 'C:\\Users\\me\\.dsh\\cicd\\known_hosts',
      workspaceRoot: '/tmp/dsh-cicd',
    }, 123)
    expect(store.getRunnerProfile()).toMatchObject({
      host: 'build.example.com',
      user: 'deploy',
      auth: 'password',
      workspaceRoot: '/tmp/dsh-cicd',
    })
    expect(store.counts().environments).toBe(1)
  })

  it('creates a run with all stages and updates them', () => {
    store = makeStore()
    store.createPipeline(pipeline())
    store.createRun(run(), initialStages(), { id: 'pl_test' })
    expect(store.getStages('run_test')).toHaveLength(7)
    expect(store.getStages('run_test').every((stage) => stage.status === 'pending')).toBe(true)
    store.updateStage('run_test', 'source', {
      status: 'succeeded',
      startedAt: 1,
      finishedAt: 2,
      exitCode: 0,
      detail: { pushed: true },
    })
    const source = store.getStages('run_test').find((stage) => stage.key === 'source')
    expect(source?.status).toBe('succeeded')
    expect(source?.detail).toEqual({ pushed: true })
    store.updateRun('run_test', { status: 'running', commitSha: 'b'.repeat(40) })
    expect(store.getRun('run_test')?.status).toBe('running')
  })

  it('stores logs in sequence and reads them in order', () => {
    store = makeStore()
    store.createPipeline(pipeline())
    store.createRun(run(), initialStages(), {})
    expect(store.appendLog('run_test', 'source', 'stdout', 'one')).toBe(1)
    expect(store.appendLog('run_test', 'source', 'stdout', 'two')).toBe(2)
    expect(store.appendLog('run_test', 'build', 'stderr', 'three')).toBe(1)
    expect(store.listLogs('run_test', 'source').map((log) => log.text)).toEqual(['one', 'two'])
    expect(store.listLogs('run_test', 'build')[0]?.stream).toBe('stderr')
  })

  it('marks active work interrupted on restart', () => {
    store = makeStore()
    store.createPipeline(pipeline())
    store.createRun(run('run_test', 'running'), [{ key: 'source', ordinal: 10, status: 'running' }], {})
    const changed = store.reconcileInterrupted()
    expect(changed).toBe(1)
    expect(store.getRun('run_test')?.status).toBe('interrupted')
    expect(store.getStages('run_test')[0]?.status).toBe('interrupted')
    expect(store.getRun('run_test')?.errorCode).toBe('INTERRUPTED')
  })

  it('cascades a pipeline delete into runs and logs', () => {
    store = makeStore()
    store.createPipeline(pipeline())
    store.createRun(run(), initialStages(), {})
    store.appendLog('run_test', 'source', 'stdout', 'line')
    expect(store.deletePipeline('pl_test')).toBe(true)
    expect(store.getRun('run_test')).toBeUndefined()
    expect(store.listLogs('run_test')).toEqual([])
  })

  it('rejects a second active run for one pipeline', () => {
    const s = makeStore()
    store = s
    s.createPipeline(pipeline())
    s.createRun(run('run_a', 'running'), initialStages(), {})
    expect(() => s.createRun(run('run_b', 'queued'), initialStages(), {})).toThrow()
  })
})
