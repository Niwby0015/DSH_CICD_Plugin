import type { StageDefinition } from '../host/domain/types.js'

export const STAGE_DEFINITIONS: StageDefinition[] = [
  { key: 'source', order: 10, primary: true, group: 'source' },
  { key: 'build', order: 20, primary: true, group: 'build' },
  { key: 'image', order: 30, primary: true, group: 'image' },
  { key: 'push', order: 40, primary: true, group: 'push' },
  { key: 'deploy', order: 50, primary: true, group: 'deploy' },
  { key: 'verify', order: 60, primary: true, group: 'verify' },
  { key: 'report', order: 70, primary: false, group: 'report' },
]
