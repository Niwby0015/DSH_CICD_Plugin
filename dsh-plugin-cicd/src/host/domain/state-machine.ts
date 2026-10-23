import { CicdError } from '../util/errors.js'
import type { RunStatus, StageStatus } from './types.js'

const STAGE_TRANSITIONS: Record<StageStatus, readonly StageStatus[]> = {
  pending: ['running', 'skipped', 'cancelled', 'interrupted'],
  running: ['succeeded', 'failed', 'cancelled', 'interrupted'],
  succeeded: [],
  failed: [],
  skipped: [],
  cancelled: [],
  interrupted: [],
}

const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ['running', 'cancelled', 'interrupted'],
  running: ['awaiting_approval', 'succeeded', 'failed', 'cancelling', 'interrupted'],
  awaiting_approval: ['running', 'failed', 'cancelled', 'interrupted'],
  cancelling: ['cancelled', 'failed', 'interrupted'],
  succeeded: [],
  failed: [],
  cancelled: [],
  interrupted: [],
}

export function canTransitionStage(from: StageStatus, to: StageStatus): boolean {
  return STAGE_TRANSITIONS[from].includes(to)
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to)
}

export function isStageTerminal(status: StageStatus): boolean {
  return STAGE_TRANSITIONS[status].length === 0
}

export function isRunTerminal(status: RunStatus): boolean {
  return RUN_TRANSITIONS[status].length === 0
}

function invalid(kind: 'stage' | 'run', from: string, to: string): CicdError {
  return new CicdError(
    'INVALID_STATE_TRANSITION',
    `illegal ${kind} transition: ${from} -> ${to}`,
    409,
    { from, to },
  )
}

export function assertStageTransition(from: StageStatus, to: StageStatus): void {
  if (!canTransitionStage(from, to)) throw invalid('stage', from, to)
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) throw invalid('run', from, to)
}

/**
 * Aggregate a run from its stages. `report` is excluded because it is the
 * terminal summarizer and must not make a failed run look successful.
 */
export function aggregateRunStatus(stages: readonly { key: string; status: StageStatus }[]): RunStatus {
  const primary = stages.filter((stage) => stage.key !== 'report')
  if (primary.some((stage) => stage.status === 'failed')) return 'failed'
  if (primary.some((stage) => stage.status === 'cancelled')) return 'cancelled'
  if (primary.some((stage) => stage.status === 'interrupted')) return 'interrupted'
  if (primary.some((stage) => stage.status === 'running')) return 'running'
  if (primary.every((stage) => stage.status === 'succeeded')) return 'succeeded'
  if (primary.some((stage) => stage.status === 'skipped')) return 'failed'
  return 'queued'
}
