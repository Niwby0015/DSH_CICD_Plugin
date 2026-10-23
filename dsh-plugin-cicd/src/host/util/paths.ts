import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { CicdConfig } from '../config.js'

export function resolveDshHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  if (configured) return resolve(configured)
  return join(homedir(), '.dsh')
}

export function resolveDataDir(config: CicdConfig): string {
  if (config.dataDir) return resolve(config.dataDir)
  return join(resolveDshHome(), 'cicd')
}

export function resolveDatabasePath(config: CicdConfig): string {
  if (config.databasePath) return resolve(config.databasePath)
  return join(resolveDataDir(config), 'cicd.db')
}
