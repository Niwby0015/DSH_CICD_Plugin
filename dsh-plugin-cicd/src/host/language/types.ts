import type { BuildConfig, LanguageKind } from '../domain/types.js'

export type CandidateLanguage = Exclude<LanguageKind, 'auto'>

export interface BuildCommands {
  tool: string
  version: string
  workingDir: string
  installCommand: string
  buildCommand: string
  testCommand: string
  dockerfilePath: string
}

export interface LanguageCandidate {
  language: CandidateLanguage
  label: string
  confidence: 'high' | 'medium'
  evidence: string[]
  root: string
  commands: BuildCommands
  warnings: string[]
  entrypoint?: string[]
}

export interface DetectionResult {
  projectPath: string
  root: string
  candidates: LanguageCandidate[]
  requiresChoice: boolean
  reason: string
}

export interface BuildPlan {
  projectPath: string
  root: string
  workingDir: string
  language: CandidateLanguage
  label: string
  tool: string
  version: string
  toolchainImage: string
  installCommand: string
  buildCommand: string
  testCommand: string
  dockerfilePath: string
  dockerfileSource: 'repository' | 'generated'
  dockerfile: string
  warnings: string[]
  evidence: string[]
}

export interface BuildPlanInput {
  projectPath: string
  projectSubdir?: string
  language?: LanguageKind
  build?: Partial<BuildConfig>
}

/** Default toolchain images; versions are explicit and never `latest`. */
export const TOOLCHAIN_IMAGES: Record<CandidateLanguage, string> = {
  'java-maven': 'maven:3.9-eclipse-temurin-21',
  'java-gradle': 'gradle:8.10-jdk21',
  node: 'node:22-bookworm-slim',
  python: 'python:3.12-slim',
  go: 'golang:1.23-bookworm',
  custom: 'debian:bookworm-slim',
}

export const LANGUAGE_LABELS: Record<CandidateLanguage, string> = {
  'java-maven': 'Java / Maven',
  'java-gradle': 'Java / Gradle',
  node: 'Node.js',
  python: 'Python',
  go: 'Go',
  custom: 'Custom',
}
