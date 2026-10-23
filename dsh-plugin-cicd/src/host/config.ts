import z from '@deepseek-ai/schemastery'

/** Non-secret global settings. Pipeline definitions live in the plugin database. */
export const Config = z.object({
  enabled: z.boolean().default(true),
  /** Empty means `<DSH_HOME>/cicd`. */
  dataDir: z.string().default(''),
  /** Empty means `<dataDir>/cicd.db`. */
  databasePath: z.string().default(''),
  maxRuns: z.number().default(500),
  maxLogBytesPerRun: z.number().default(10 * 1024 * 1024),
})

export type CicdConfig = {
  enabled: boolean
  dataDir: string
  databasePath: string
  maxRuns: number
  maxLogBytesPerRun: number
}

export function normalizeConfig(input: unknown): CicdConfig {
  const raw = (input ?? {}) as Partial<CicdConfig>
  return {
    enabled: raw.enabled !== false,
    dataDir: typeof raw.dataDir === 'string' ? raw.dataDir.trim() : '',
    databasePath: typeof raw.databasePath === 'string' ? raw.databasePath.trim() : '',
    maxRuns: Number.isFinite(raw.maxRuns) && (raw.maxRuns ?? 0) > 0 ? Math.trunc(raw.maxRuns as number) : 500,
    maxLogBytesPerRun:
      Number.isFinite(raw.maxLogBytesPerRun) && (raw.maxLogBytesPerRun ?? 0) > 0
        ? Math.trunc(raw.maxLogBytesPerRun as number)
        : 10 * 1024 * 1024,
  }
}
