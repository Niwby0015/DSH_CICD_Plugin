import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PipelineService } from '../../src/host/domain/pipeline-service.js'
import { RunExecutor } from '../../src/host/execution/run-executor.js'
import type { ProcessRunner } from '../../src/host/git/process.js'
import { openStore, type CicdStore } from '../../src/host/store/sqlite-store.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-execution-'))
  dirs.push(dir)
  const store = openStore({ databasePath: join(dir, 'cicd.db') })
  const service = new PipelineService({ store })
  const runner: ProcessRunner = {
    async run() {
      return { code: 0, stdout: '', stderr: '', timedOut: false }
    },
  }
  const executor = new RunExecutor(store, service, () => runner, () => undefined)
  service.setRunStarter(executor)
  return { store, service }
}

async function waitFor(store: CicdStore, runId: string, timeoutMs = 3000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const run = store.getRun(runId)
    if (run && ['failed', 'succeeded', 'cancelled'].includes(run.status)) return run
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('run did not finish')
}

describe('run executor without a runner profile', () => {
  it('records a failed run and skipped stages instead of leaving it queued', async () => {
    const { store, service } = setup()
    const pipeline = service.createPipeline({
      name: 'no-runner',
      projectPath: process.platform === 'win32' ? 'D:\\work\\demo' : '/work/demo',
      repoUrl: 'https://github.com/acme/demo.git',
      language: 'node',
    }).pipeline
    const detail = service.startRun(pipeline.id)
    const finished = await waitFor(store, detail.run.id)
    expect(finished.status).toBe('failed')
    expect(finished.errorCode).toBe('RUNNER_UNAVAILABLE')
    const stages = store.getStages(detail.run.id)
    for (const stage of stages.filter((item) => item.key !== 'report')) {
      expect(stage.status).toBe('skipped')
    }
    expect(stages.find((stage) => stage.key === 'report')?.status).toBe('failed')
    store.close()
  })
})
