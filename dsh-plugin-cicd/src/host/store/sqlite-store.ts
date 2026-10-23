import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { CicdError } from '../util/errors.js'
import type { NewStage } from '../domain/stage-definitions.js'
import type {
  LogRecord,
  PipelineDefinition,
  RunRecord,
  RunStageRecord,
  RunSummary,
  StageKey,
  StageStatus,
  RunStatus,
} from '../domain/types.js'
import { EMPTY_BUILD_CONFIG, EMPTY_DEPLOY_CONFIG } from '../domain/types.js'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js'

const nodeRequire = createRequire(import.meta.url)

interface Statement {
  run(...params: unknown[]): { changes: number | bigint }
  get(...params: unknown[]): Record<string, unknown> | undefined
  all(...params: unknown[]): Record<string, unknown>[]
}

interface Database {
  exec(sql: string): void
  prepare(sql: string): Statement
  close(): void
}

interface DatabaseConstructor {
  new (path: string): Database
}

export interface StoreLogger {
  info(message: string): void
  warn(message: string): void
}

export interface CicdStore {
  status(): { backend: 'sqlite'; path: string; schemaVersion: number }
  close(): void
  counts(): { pipelines: number; runs: number; running: number; environments: number }
  createPipeline(record: PipelineDefinition): void
  updatePipeline(record: PipelineDefinition): void
  deletePipeline(id: string): boolean
  getPipeline(id: string): PipelineDefinition | undefined
  listPipelines(limit?: number): PipelineDefinition[]
  pipelineRunCount(pipelineId: string): number
  getRunnerProfile(id?: string): Record<string, unknown> | undefined
  saveRunnerProfile(id: string, config: Record<string, unknown>, updatedAt: number): void
  createRun(record: RunRecord, stages: NewStage[], configSnapshot: unknown): void
  updateRun(id: string, patch: Partial<RunRecord>): void
  getRun(id: string): RunRecord | undefined
  lastRun(pipelineId: string): RunSummary | undefined
  listRuns(limit?: number, pipelineId?: string): RunSummary[]
  getStages(runId: string): RunStageRecord[]
  updateStage(runId: string, key: StageKey, patch: Partial<RunStageRecord>): void
  appendLog(runId: string, stageKey: StageKey, stream: LogRecord['stream'], text: string): number
  listLogs(runId: string, stageKey?: StageKey, after?: number, limit?: number): LogRecord[]
  reconcileInterrupted(): number
  prune(maxRuns: number): number
}

const RUN_COLUMNS: Record<keyof RunRecord, string> = {
  id: 'id',
  pipelineId: 'pipeline_id',
  trigger: 'trigger',
  status: 'status',
  commitSha: 'commit_sha',
  branch: 'branch',
  imageRef: 'image_ref',
  imageDigest: 'image_digest',
  runnerKind: 'runner_kind',
  targetEnvironment: 'target_environment',
  namespace: 'namespace',
  planHash: 'plan_hash',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  cleanupState: 'cleanup_state',
  cleanupMessage: 'cleanup_message',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
  createdAt: 'created_at',
}

const STAGE_COLUMNS: Record<keyof RunStageRecord, string> = {
  runId: 'run_id',
  key: 'key',
  ordinal: 'ordinal',
  status: 'status',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
  exitCode: 'exit_code',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  detail: 'detail_json',
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.length === 0) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return asRecord(value)
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function pipelineFromRow(row: Record<string, unknown>): PipelineDefinition {
  const config = asRecord(row.config_json)
  return {
    id: asString(row.id),
    name: asString(row.name),
    description: asString(config.description),
    projectPath: asString(config.projectPath),
    projectSubdir: asString(config.projectSubdir),
    repoUrl: asString(config.repoUrl),
    branch: asString(config.branch, 'main'),
    language: (config.language as PipelineDefinition['language']) ?? 'auto',
    build: {
      ...EMPTY_BUILD_CONFIG,
      ...(asObject(config.build) as Partial<PipelineDefinition['build']>),
    },
    deploy: {
      ...EMPTY_DEPLOY_CONFIG,
      ...(asObject(config.deploy) as Partial<PipelineDefinition['deploy']>),
    },
    imageRepository: asString(config.imageRepository),
    imageTagTemplate: asString(config.imageTagTemplate, 'sha-{sha7}'),
    targetEnvironment: asString(config.targetEnvironment),
    namespace: asString(config.namespace),
    releaseName: asString(config.releaseName),
    deployStrategy: (config.deployStrategy as PipelineDefinition['deployStrategy']) ?? 'auto',
    runnerKind: 'ssh',
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
  }
}

function configJson(record: PipelineDefinition): string {
  return JSON.stringify({
    description: record.description,
    projectPath: record.projectPath,
    projectSubdir: record.projectSubdir,
    repoUrl: record.repoUrl,
    branch: record.branch,
    language: record.language,
    build: record.build,
    deploy: record.deploy,
    imageRepository: record.imageRepository,
    imageTagTemplate: record.imageTagTemplate,
    targetEnvironment: record.targetEnvironment,
    namespace: record.namespace,
    releaseName: record.releaseName,
    deployStrategy: record.deployStrategy,
    runnerKind: record.runnerKind,
  })
}

function runFromRow(row: Record<string, unknown>): RunRecord {
  return {
    id: asString(row.id),
    pipelineId: asString(row.pipeline_id),
    trigger: asString(row.trigger, 'ui') as RunRecord['trigger'],
    status: asString(row.status, 'queued') as RunStatus,
    commitSha: asString(row.commit_sha),
    branch: asString(row.branch),
    imageRef: asString(row.image_ref),
    imageDigest: asString(row.image_digest),
    runnerKind: asString(row.runner_kind),
    targetEnvironment: asString(row.target_environment),
    namespace: asString(row.namespace),
    planHash: asString(row.plan_hash),
    errorCode: asString(row.error_code),
    errorMessage: asString(row.error_message),
    cleanupState: asString(row.cleanup_state, 'not_started') as RunRecord['cleanupState'],
    cleanupMessage: asString(row.cleanup_message),
    startedAt: asNullableNumber(row.started_at),
    finishedAt: asNullableNumber(row.finished_at),
    createdAt: asNumber(row.created_at),
  }
}

function summaryFromRow(row: Record<string, unknown>): RunSummary {
  const run = runFromRow(row)
  return {
    id: run.id,
    pipelineId: run.pipelineId,
    status: run.status,
    commitSha: run.commitSha,
    imageRef: run.imageRef,
    runnerKind: run.runnerKind,
    targetEnvironment: run.targetEnvironment,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
  }
}

function stageFromRow(row: Record<string, unknown>): RunStageRecord {
  return {
    runId: asString(row.run_id),
    key: asString(row.key) as StageKey,
    ordinal: asNumber(row.ordinal),
    status: asString(row.status, 'pending') as StageStatus,
    startedAt: asNullableNumber(row.started_at),
    finishedAt: asNullableNumber(row.finished_at),
    exitCode: asNullableNumber(row.exit_code),
    errorCode: asString(row.error_code) || null,
    errorMessage: asString(row.error_message) || null,
    detail: asRecord(row.detail_json),
  }
}

export interface OpenStoreOptions {
  databasePath: string
  logger?: StoreLogger
  maxRuns?: number
}

/** Open the plugin-private SQLite store. A failure is fatal: no memory fallback for state. */
export function openStore(options: OpenStoreOptions): CicdStore {
  const { databasePath, logger } = options
  let db: Database | undefined
  try {
    const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: DatabaseConstructor }
    if (!DatabaseSync) throw new Error('node:sqlite is not available in this runtime')
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
    db = new DatabaseSync(databasePath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec(SCHEMA_SQL)
    const versionRow = db.prepare('PRAGMA user_version').get()
    const version = asNumber(versionRow?.user_version)
    if (version > SCHEMA_VERSION) {
      throw new Error(`database schema ${version} is newer than supported ${SCHEMA_VERSION}`)
    }
    if (version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    logger?.info(`opened SQLite store at ${databasePath} (schema ${SCHEMA_VERSION})`)
  } catch (error) {
    try {
      db?.close()
    } catch {
      // best effort
    }
    throw new CicdError(
      'STORE_UNAVAILABLE',
      `cannot open CI/CD database: ${error instanceof Error ? error.message : String(error)}`,
      500,
    )
  }

  const live = db
  if (!live) throw new CicdError('STORE_UNAVAILABLE', 'database was not opened', 500)
  const statements = new Map<string, Statement>()
  const stmt = (sql: string): Statement => {
    const cached = statements.get(sql)
    if (cached) return cached
    const prepared = live.prepare(sql)
    statements.set(sql, prepared)
    return prepared
  }

  function updateFields(
    table: 'runs' | 'stages',
    columns: Record<string, string>,
    keyWhere: { column: string; value: string }[],
    patch: Record<string, unknown>,
  ): void {
    const assignments: string[] = []
    const values: unknown[] = []
    for (const [field, value] of Object.entries(patch)) {
      const column = columns[field]
      if (!column || value === undefined) continue
      assignments.push(`${column} = ?`)
      values.push(field === 'detail' ? JSON.stringify(value) : value)
    }
    if (assignments.length === 0) return
    const where = keyWhere.map((entry) => `${entry.column} = ?`).join(' AND ')
    stmt(`UPDATE ${table} SET ${assignments.join(', ')} WHERE ${where}`).run(
      ...values,
      ...keyWhere.map((entry) => entry.value),
    )
  }

  return {
    status() {
      const row = stmt('PRAGMA user_version').get()
      return { backend: 'sqlite', path: databasePath, schemaVersion: asNumber(row?.user_version) }
    },

    close() {
      statements.clear()
      live.close()
    },

    counts() {
      const total = Number(stmt('SELECT COUNT(*) AS n FROM pipelines').get()?.n ?? 0)
      const runs = Number(stmt('SELECT COUNT(*) AS n FROM runs').get()?.n ?? 0)
      const running = Number(
        stmt("SELECT COUNT(*) AS n FROM runs WHERE status IN ('running','queued','awaiting_approval','cancelling')").get()?.n ??
          0,
      )
      const environments = Number(stmt('SELECT COUNT(*) AS n FROM runner_profiles').get()?.n ?? 0)
      return { pipelines: total, runs, running, environments }
    },

    createPipeline(record) {
      stmt('INSERT INTO pipelines (id, name, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        record.id,
        record.name,
        configJson(record),
        record.createdAt,
        record.updatedAt,
      )
    },

    updatePipeline(record) {
      stmt('UPDATE pipelines SET name = ?, config_json = ?, updated_at = ? WHERE id = ?').run(
        record.name,
        configJson(record),
        record.updatedAt,
        record.id,
      )
    },

    deletePipeline(id) {
      return Number(stmt('DELETE FROM pipelines WHERE id = ?').run(id).changes) > 0
    },

    getPipeline(id) {
      const row = stmt('SELECT * FROM pipelines WHERE id = ?').get(id)
      return row ? pipelineFromRow(row) : undefined
    },

    listPipelines(limit = 100) {
      return stmt('SELECT * FROM pipelines ORDER BY updated_at DESC LIMIT ?')
        .all(Math.max(1, Math.min(500, Math.trunc(limit))))
        .map(pipelineFromRow)
    },

    pipelineRunCount(pipelineId) {
      return Number(stmt('SELECT COUNT(*) AS n FROM runs WHERE pipeline_id = ?').get(pipelineId)?.n ?? 0)
    },

    getRunnerProfile(id = 'default') {
      const row = stmt('SELECT config_json FROM runner_profiles WHERE id = ?').get(id)
      if (!row) return undefined
      return asRecord(row.config_json)
    },

    saveRunnerProfile(id, config, updatedAt) {
      stmt(
        `INSERT INTO runner_profiles (id, config_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
      ).run(id, JSON.stringify(config), updatedAt)
    },

    createRun(record, stages, configSnapshot) {
      live.exec('BEGIN IMMEDIATE')
      try {
        stmt(
          `INSERT INTO runs (
            id, pipeline_id, trigger, status, commit_sha, branch, image_ref, image_digest,
            runner_kind, target_environment, namespace, plan_hash, config_snapshot_json,
            error_code, error_message, cleanup_state, cleanup_message, started_at, finished_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          record.id,
          record.pipelineId,
          record.trigger,
          record.status,
          record.commitSha,
          record.branch,
          record.imageRef,
          record.imageDigest,
          record.runnerKind,
          record.targetEnvironment,
          record.namespace,
          record.planHash,
          JSON.stringify(configSnapshot),
          record.errorCode,
          record.errorMessage,
          record.cleanupState,
          record.cleanupMessage,
          record.startedAt,
          record.finishedAt,
          record.createdAt,
        )
        for (const stage of stages) {
          stmt('INSERT INTO stages (run_id, key, ordinal, status, detail_json) VALUES (?, ?, ?, ?, ?)').run(
            record.id,
            stage.key,
            stage.ordinal,
            stage.status,
            '{}',
          )
        }
        live.exec('COMMIT')
      } catch (error) {
        live.exec('ROLLBACK')
        throw error
      }
    },

    updateRun(id, patch) {
      updateFields('runs', RUN_COLUMNS, [{ column: 'id', value: id }], patch as Record<string, unknown>)
    },

    getRun(id) {
      const row = stmt('SELECT * FROM runs WHERE id = ?').get(id)
      return row ? runFromRow(row) : undefined
    },

    lastRun(pipelineId) {
      const row = stmt('SELECT * FROM runs WHERE pipeline_id = ? ORDER BY created_at DESC LIMIT 1').get(pipelineId)
      return row ? summaryFromRow(row) : undefined
    },

    listRuns(limit = 50, pipelineId) {
      const capped = Math.max(1, Math.min(500, Math.trunc(limit)))
      const rows = pipelineId
        ? stmt('SELECT * FROM runs WHERE pipeline_id = ? ORDER BY created_at DESC LIMIT ?').all(pipelineId, capped)
        : stmt('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?').all(capped)
      return rows.map(summaryFromRow)
    },

    getStages(runId) {
      return stmt('SELECT * FROM stages WHERE run_id = ? ORDER BY ordinal').all(runId).map(stageFromRow)
    },

    updateStage(runId, key, patch) {
      updateFields(
        'stages',
        STAGE_COLUMNS,
        [
          { column: 'run_id', value: runId },
          { column: 'key', value: key },
        ],
        patch as Record<string, unknown>,
      )
    },

    appendLog(runId, stageKey, stream, text) {
      const next = Number(
        stmt('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM stage_logs WHERE run_id = ? AND stage_key = ?').get(
          runId,
          stageKey,
        )?.n ?? 1,
      )
      stmt('INSERT INTO stage_logs (run_id, stage_key, seq, ts, stream, text) VALUES (?, ?, ?, ?, ?, ?)').run(
        runId,
        stageKey,
        next,
        Date.now(),
        stream,
        text,
      )
      return next
    },

    listLogs(runId, stageKey, after = 0, limit = 500) {
      const capped = Math.max(1, Math.min(2000, Math.trunc(limit)))
      const rows = stageKey
        ? stmt(
            'SELECT seq, ts, stream, text FROM stage_logs WHERE run_id = ? AND stage_key = ? AND seq > ? ORDER BY seq LIMIT ?',
          ).all(runId, stageKey, after, capped)
        : stmt('SELECT seq, ts, stream, text FROM stage_logs WHERE run_id = ? AND seq > ? ORDER BY seq LIMIT ?').all(
            runId,
            after,
            capped,
          )
      return rows.map((row) => ({
        seq: asNumber(row.seq),
        ts: asNumber(row.ts),
        stream: asString(row.stream, 'system') as LogRecord['stream'],
        text: asString(row.text),
      }))
    },

    reconcileInterrupted() {
      const rows = live
        .prepare("SELECT id FROM runs WHERE status IN ('queued','running','awaiting_approval','cancelling')")
        .all()
      if (rows.length === 0) return 0
      const now = Date.now()
      live.exec('BEGIN IMMEDIATE')
      try {
        for (const row of rows) {
          const id = asString(row.id)
          stmt(
            "UPDATE runs SET status = 'interrupted', finished_at = ?, error_code = 'INTERRUPTED', error_message = ? WHERE id = ?",
          ).run(now, 'DSH restarted before the run reached a terminal state', id)
          stmt(
            "UPDATE stages SET status = 'interrupted', finished_at = ?, error_code = 'INTERRUPTED', error_message = ? WHERE run_id = ? AND status IN ('pending','running')",
          ).run(now, 'DSH restarted', id)
          stmt('INSERT INTO events (run_id, ts, kind, payload_json) VALUES (?, ?, ?, ?)').run(
            id,
            now,
            'run/interrupted',
            JSON.stringify({ reason: 'DSH restart' }),
          )
        }
        live.exec('COMMIT')
      } catch (error) {
        live.exec('ROLLBACK')
        throw error
      }
      logger?.warn(`marked ${rows.length} interrupted run(s) from a previous DSH process`)
      return rows.length
    },

    prune(maxRuns) {
      const capped = Math.max(1, Math.trunc(maxRuns))
      const result = live
        .prepare(
          `DELETE FROM runs WHERE id NOT IN (
             SELECT id FROM runs ORDER BY created_at DESC LIMIT ?
           )`,
        )
        .run(capped)
      return Number(result.changes)
    },
  }
}
