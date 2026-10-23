import type { StageDefinition, StageKey, StageStatus } from './types.js'

/** The six visible stages plus the terminal report. */
export const STAGE_DEFINITIONS: readonly StageDefinition[] = [
  { key: 'source', order: 10, primary: true, group: 'source' },
  { key: 'build', order: 20, primary: true, group: 'build' },
  { key: 'image', order: 30, primary: true, group: 'image' },
  { key: 'push', order: 40, primary: true, group: 'push' },
  { key: 'deploy', order: 50, primary: true, group: 'deploy' },
  { key: 'verify', order: 60, primary: true, group: 'verify' },
  { key: 'report', order: 70, primary: false, group: 'report' },
]

export const PRIMARY_STAGES = STAGE_DEFINITIONS.filter((definition) => definition.primary)

export function isStageKey(value: string): value is StageKey {
  return STAGE_DEFINITIONS.some((definition) => definition.key === value)
}

export interface NewStage {
  key: StageKey
  ordinal: number
  status: StageStatus
}

/** Fresh run stages: everything is waiting until the orchestrator claims it. */
export function initialStages(): NewStage[] {
  return STAGE_DEFINITIONS.map((definition) => ({
    key: definition.key,
    ordinal: definition.order,
    status: 'pending',
  }))
}
