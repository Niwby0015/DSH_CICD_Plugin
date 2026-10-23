import { describe, expect, it } from 'vitest'
import {
  aggregateRunStatus,
  assertRunTransition,
  assertStageTransition,
  canTransitionRun,
  canTransitionStage,
  isRunTerminal,
  isStageTerminal,
} from '../../src/host/domain/state-machine.js'

describe('stage state machine', () => {
  it('allows the documented happy path', () => {
    expect(canTransitionStage('pending', 'running')).toBe(true)
    expect(canTransitionStage('running', 'succeeded')).toBe(true)
    expect(canTransitionStage('pending', 'skipped')).toBe(true)
    expect(canTransitionStage('running', 'interrupted')).toBe(true)
  })

  it('requires running before succeeded', () => {
    expect(canTransitionStage('pending', 'succeeded')).toBe(false)
    expect(() => assertStageTransition('pending', 'succeeded')).toThrow(/illegal stage transition/)
  })

  it('rejects a terminal stage going back to running', () => {
    expect(canTransitionStage('succeeded', 'running')).toBe(false)
    expect(() => assertStageTransition('succeeded', 'running')).toThrow(/illegal stage transition/)
  })

  it('marks terminal states', () => {
    expect(isStageTerminal('succeeded')).toBe(true)
    expect(isStageTerminal('failed')).toBe(true)
    expect(isStageTerminal('cancelled')).toBe(true)
    expect(isStageTerminal('running')).toBe(false)
  })
})

describe('run state machine', () => {
  it('allows build -> approval -> deploy', () => {
    expect(canTransitionRun('queued', 'running')).toBe(true)
    expect(canTransitionRun('running', 'awaiting_approval')).toBe(true)
    expect(canTransitionRun('awaiting_approval', 'running')).toBe(true)
  })

  it('rejects an illegal transition with a stable error', () => {
    expect(() => assertRunTransition('succeeded', 'running')).toThrow(/illegal run transition/)
  })

  it('treats terminal runs as terminal', () => {
    expect(isRunTerminal('succeeded')).toBe(true)
    expect(isRunTerminal('failed')).toBe(true)
    expect(isRunTerminal('cancelled')).toBe(true)
    expect(isRunTerminal('awaiting_approval')).toBe(false)
  })
})

describe('aggregateRunStatus', () => {
  it('never lets the report hide a failed primary stage', () => {
    expect(
      aggregateRunStatus([
        { key: 'source', status: 'succeeded' },
        { key: 'build', status: 'failed' },
        { key: 'report', status: 'succeeded' },
      ]),
    ).toBe('failed')
  })

  it('reports a cancelled run even when the report succeeded', () => {
    expect(
      aggregateRunStatus([
        { key: 'source', status: 'succeeded' },
        { key: 'build', status: 'cancelled' },
        { key: 'report', status: 'succeeded' },
      ]),
    ).toBe('cancelled')
  })

  it('reports success only when every primary stage succeeded', () => {
    expect(
      aggregateRunStatus([
        { key: 'source', status: 'succeeded' },
        { key: 'build', status: 'succeeded' },
        { key: 'report', status: 'succeeded' },
      ]),
    ).toBe('succeeded')
  })
})
