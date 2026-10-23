import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PipelineService } from '../../src/host/domain/pipeline-service.js'
import { openStore, type CicdStore } from '../../src/host/store/sqlite-store.js'

const dirs: string[] = []
let store: CicdStore | undefined

function setup(): PipelineService {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-service-'))
  dirs.push(dir)
  store = openStore({ databasePath: join(dir, 'cicd.db') })
  let n = 0
  return new PipelineService({
    store,
    now: () => 1_700_000_000_000 + n++,
    id: (prefix) => `${prefix}_test${n}`,
  })
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

describe('PipelineService', () => {
  it('creates, updates and lists a pipeline', () => {
    const service = setup()
    const created = service.createPipeline({ name: 'demo', branch: 'main' })
    expect(created.created).toBe(true)
    expect(created.pipeline.status).toBe('draft')
    expect(service.listPipelines()).toHaveLength(1)

    const updated = service.updatePipeline(created.pipeline.id, {
      name: 'demo release',
      projectPath: process.platform === 'win32' ? 'D:\\work\\demo' : '/work/demo',
      repoUrl: 'https://github.com/acme/demo.git',
      branch: 'main',
      language: 'node',
      targetEnvironment: 'staging',
    })
    expect(updated.created).toBe(false)
    expect(updated.pipeline.name).toBe('demo release')
    expect(updated.pipeline.status).toBe('ready')
    expect(service.getPipeline(created.pipeline.id).language).toBe('node')
  })

  it('rejects unsafe or malformed configuration', () => {
    const service = setup()
    expect(() => service.createPipeline({ name: '   ' })).toThrow(/name is required/)
    expect(() => service.createPipeline({ name: 'x', projectPath: 'relative/path' })).toThrow(/absolute/)
    expect(() => service.createPipeline({ name: 'x', repoUrl: 'https://token@github.com/acme/demo.git' })).toThrow(/credentials/)
    expect(() => service.createPipeline({ name: 'x', namespace: 'Bad Namespace' })).toThrow(/namespace/)
    expect(() => service.createPipeline({ name: 'x', language: 'ruby' as never })).toThrow(/language/)
  })

  it('creates queued runs internally but refuses execution from the UI', () => {
    const service = setup()
    const pipeline = service.createPipeline({
      name: 'demo',
      projectPath: process.platform === 'win32' ? 'D:\\work\\demo' : '/work/demo',
      repoUrl: 'https://github.com/acme/demo.git',
      language: 'node',
    }).pipeline
    const run = service.createQueuedRun(pipeline.id, { commitSha: 'a'.repeat(40) })
    expect(run.run.status).toBe('queued')
    expect(run.stages).toHaveLength(7)
    expect(() => service.createQueuedRun(pipeline.id, { commitSha: 'b'.repeat(40) })).toThrow(/active run/)
    expect(() => service.startRun(pipeline.id)).toThrow(/not wired/)
  })

  it('hands a queued run to the configured starter', () => {
    const service = setup()
    const pipeline = service.createPipeline({
      name: 'starter',
      projectPath: process.platform === 'win32' ? 'D:\\work\\demo' : '/work/demo',
      repoUrl: 'https://github.com/acme/demo.git',
      language: 'node',
    }).pipeline
    let handedOff = ''
    service.setRunStarter({ start(run) { handedOff = run.run.id } })
    const run = service.startRun(pipeline.id)
    expect(run.run.status).toBe('queued')
    expect(handedOff).toBe(run.run.id)
  })

  it('cancels a queued run and marks pending stages cancelled', () => {
    const service = setup()
    const pipeline = service.createPipeline({ name: 'queued-cancel' }).pipeline
    const run = service.createQueuedRun(pipeline.id)
    const cancelled = service.cancelRun(run.run.id)
    expect(cancelled.run.status).toBe('cancelled')
    expect(cancelled.stages.every((stage) => stage.status === 'cancelled')).toBe(true)
  })

  it('moves a running run to cancelling and delegates to the executor', () => {
    const service = setup()
    const pipeline = service.createPipeline({ name: 'running-cancel' }).pipeline
    const run = service.createQueuedRun(pipeline.id)
    service.transitionRun(run.run.id, 'running')
    let cancelledId = ''
    service.setRunCanceller({ cancel(id) { cancelledId = id; return true } })
    const detail = service.cancelRun(run.run.id)
    expect(detail.run.status).toBe('cancelling')
    expect(cancelledId).toBe(run.run.id)
  })

  it('enforces state transitions', () => {
    const service = setup()
    const pipeline = service.createPipeline({ name: 'demo' }).pipeline
    const run = service.createQueuedRun(pipeline.id)
    service.transitionRun(run.run.id, 'running')
    expect(() => service.transitionRun(run.run.id, 'queued')).toThrow(/illegal run transition/)
    service.transitionStage(run.run.id, 'source', 'running')
    service.transitionStage(run.run.id, 'source', 'succeeded')
    expect(() => service.transitionStage(run.run.id, 'source', 'running')).toThrow(/illegal stage transition/)
  })

  it('reports honest capabilities for this phase', () => {
    const service = setup()
    const capabilities = service.capabilities()
    expect(capabilities.storage.available).toBe(true)
    expect(capabilities.git.available).toBe(false)
    expect(capabilities.sshRunner.available).toBe(false)
    expect(capabilities.pipelineExecution.available).toBe(false)
    expect(capabilities.pipelineExecution.reason).toMatch(/不|not|不存在|fake|虚假/i)
  })

  it('deletes a pipeline only after its active run is terminal', () => {
    const service = setup()
    const pipeline = service.createPipeline({ name: 'demo' }).pipeline
    const run = service.createQueuedRun(pipeline.id)
    expect(() => service.deletePipeline(pipeline.id)).toThrow(/active run/)
    service.transitionRun(run.run.id, 'cancelled', { finishedAt: Date.now() })
    service.deletePipeline(pipeline.id)
    expect(() => service.getPipeline(pipeline.id)).toThrow(/not found/)
  })
})
