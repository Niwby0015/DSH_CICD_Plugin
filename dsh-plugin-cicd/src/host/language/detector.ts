import { readFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { CicdError } from '../util/errors.js'
import type { CandidateLanguage, DetectionResult, LanguageCandidate } from './types.js'
import { LANGUAGE_LABELS } from './types.js'

interface Scan {
  root: string
  names: Set<string>
  packageJson?: {
    packageManager?: string
    scripts?: Record<string, string>
    workspaces?: unknown
    main?: string
  }
  pyproject?: string
  requirements?: string
}

function assertInside(root: string, candidate: string): string {
  const rel = relative(root, candidate)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new CicdError('INVALID_INPUT', 'projectSubdir escapes the project root', 400)
  }
  return candidate
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

async function scanRoot(root: string): Promise<Scan> {
  let info
  try {
    info = await stat(root)
  } catch {
    throw new CicdError('INVALID_INPUT', `project directory does not exist: ${root}`, 400)
  }
  if (!info.isDirectory()) throw new CicdError('INVALID_INPUT', `project path is not a directory: ${root}`, 400)
  const entries = await readdir(root, { withFileTypes: true })
  const names = new Set(entries.map((entry) => entry.name))
  const packageText = names.has('package.json') ? await readOptional(join(root, 'package.json')) : undefined
  let packageJson: Scan['packageJson']
  if (packageText) {
    try {
      const parsed = JSON.parse(packageText) as Record<string, unknown>
      packageJson = {
        ...(typeof parsed.packageManager === 'string' ? { packageManager: parsed.packageManager } : {}),
        ...(parsed.scripts && typeof parsed.scripts === 'object' && !Array.isArray(parsed.scripts)
          ? { scripts: parsed.scripts as Record<string, string> }
          : {}),
        ...(parsed.workspaces !== undefined ? { workspaces: parsed.workspaces } : {}),
        ...(typeof parsed.main === 'string' ? { main: parsed.main } : {}),
      }
    } catch {
      throw new CicdError('INVALID_INPUT', 'package.json is not valid JSON', 400)
    }
  }
  return {
    root,
    names,
    ...(packageJson ? { packageJson } : {}),
    ...(names.has('pyproject.toml') ? { pyproject: await readOptional(join(root, 'pyproject.toml')) ?? '' } : {}),
    ...(names.has('requirements.txt') ? { requirements: await readOptional(join(root, 'requirements.txt')) ?? '' } : {}),
  }
}

async function hasGoCommand(root: string): Promise<string> {
  try {
    const cmd = await readdir(join(root, 'cmd'), { withFileTypes: true })
    const dirs = cmd.filter((entry) => entry.isDirectory())
    if (dirs.length === 1) {
      const files = await readdir(join(root, 'cmd', dirs[0]!.name)).catch(() => [])
      if (files.some((name) => String(name).endsWith('.go'))) return `./cmd/${dirs[0]!.name}`
    }
    if (dirs.length > 1) return './...'
  } catch {
    // no cmd directory
  }
  return '.'
}

function mavenCandidate(scan: Scan, workingDir: string): LanguageCandidate {
  const wrapper = scan.names.has('mvnw') || scan.names.has('mvnw.cmd')
  const pom = readOptionalSafe(scan.root, 'pom.xml')
  const modules = pom ? [...pom.matchAll(/<module>\s*([^<\s]+)\s*<\/module>/g)].map((match) => match[1]!) : []
  return {
    language: 'java-maven',
    label: LANGUAGE_LABELS['java-maven'],
    confidence: 'high',
    evidence: ['pom.xml', ...(wrapper ? ['mvnw'] : []), ...modules.slice(0, 5).map((module) => `module:${module}`)],
    root: scan.root,
    warnings: modules.length > 1 ? [`multi-module Maven project (${modules.length} modules) builds from the reactor root`] : [],
    commands: {
      tool: 'maven',
      version: '3.9',
      workingDir,
      installCommand: '',
      buildCommand: `${wrapper ? './mvnw' : 'mvn'} -B -DskipTests package`,
      testCommand: `${wrapper ? './mvnw' : 'mvn'} -B test`,
      dockerfilePath: scan.names.has('Dockerfile') ? 'Dockerfile' : 'Dockerfile.cicd',
    },
    entrypoint: ['java', '-jar', '/app/app.jar'],
  }
}

function gradleCandidate(scan: Scan, workingDir: string): LanguageCandidate {
  const wrapper = scan.names.has('gradlew') || scan.names.has('gradlew.bat')
  const buildFile = scan.names.has('build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle'
  return {
    language: 'java-gradle',
    label: LANGUAGE_LABELS['java-gradle'],
    confidence: 'high',
    evidence: [buildFile, ...(scan.names.has('settings.gradle.kts') ? ['settings.gradle.kts'] : []), ...(wrapper ? ['gradlew'] : [])],
    root: scan.root,
    warnings: [],
    commands: {
      tool: 'gradle',
      version: '8.10',
      workingDir,
      installCommand: '',
      buildCommand: `${wrapper ? './gradlew' : 'gradle'} --no-daemon assemble`,
      testCommand: `${wrapper ? './gradlew' : 'gradle'} --no-daemon test`,
      dockerfilePath: scan.names.has('Dockerfile') ? 'Dockerfile' : 'Dockerfile.cicd',
    },
    entrypoint: ['java', '-jar', '/app/app.jar'],
  }
}

function nodeCandidate(scan: Scan, workingDir: string): LanguageCandidate {
  const scripts = scan.packageJson?.scripts ?? {}
  const managerHint = scan.packageJson?.packageManager ?? ''
  const manager = managerHint.startsWith('pnpm@') || scan.names.has('pnpm-lock.yaml')
    ? 'pnpm'
    : managerHint.startsWith('yarn@') || scan.names.has('yarn.lock')
      ? 'yarn'
      : 'npm'
  const install = manager === 'pnpm'
    ? 'pnpm install --frozen-lockfile'
    : manager === 'yarn'
      ? 'yarn install --frozen-lockfile'
      : scan.names.has('package-lock.json') ? 'npm ci' : 'npm install'
  const run = manager === 'pnpm' ? 'pnpm run' : manager === 'yarn' ? 'yarn' : 'npm run'
  const warnings: string[] = []
  if (!scripts.build) warnings.push('package.json has no build script; build step will be skipped until configured')
  if (!scripts.test) warnings.push('package.json has no test script; test step will be skipped until configured')
  if (!scripts.start && !scan.packageJson?.main) warnings.push('no start script or main field; review the generated container entrypoint')
  if (scan.packageJson?.workspaces) warnings.push('workspace project: the build runs from the workspace root')
  return {
    language: 'node',
    label: LANGUAGE_LABELS.node,
    confidence: 'high',
    evidence: ['package.json', ...(scan.names.has('pnpm-lock.yaml') ? ['pnpm-lock.yaml'] : []), ...(scan.names.has('yarn.lock') ? ['yarn.lock'] : []), ...(scan.names.has('package-lock.json') ? ['package-lock.json'] : [])],
    root: scan.root,
    warnings,
    commands: {
      tool: manager,
      version: '22',
      workingDir,
      installCommand: install,
      buildCommand: scripts.build ? `${run} build` : '',
      testCommand: scripts.test ? `${run} test` : '',
      dockerfilePath: scan.names.has('Dockerfile') ? 'Dockerfile' : 'Dockerfile.cicd',
    },
    entrypoint: scripts.start ? [manager === 'yarn' ? 'yarn' : manager === 'pnpm' ? 'pnpm' : 'npm', 'start'] : ['node', scan.packageJson?.main ?? 'dist/index.js'],
  }
}

function pythonCandidate(scan: Scan, workingDir: string): LanguageCandidate {
  const evidence = ['pyproject.toml', 'requirements.txt'].filter((name) => scan.names.has(name))
  const hasPytest = scan.names.has('pytest.ini') || scan.names.has('conftest.py') || (scan.pyproject ?? '').includes('[tool.pytest') || (scan.requirements ?? '').includes('pytest')
  const install = scan.names.has('requirements.txt')
    ? 'python -m pip install -r requirements.txt'
    : scan.names.has('pyproject.toml') ? 'python -m pip install .' : ''
  const warnings: string[] = []
  if (!install) warnings.push('no requirements.txt or pyproject.toml; install step will be skipped')
  if (!hasPytest) warnings.push('pytest was not detected; the test command uses unittest discovery')
  if (!scan.names.has('main.py')) warnings.push('main.py was not found; review the generated container entrypoint')
  return {
    language: 'python',
    label: LANGUAGE_LABELS.python,
    confidence: scan.names.has('pyproject.toml') || scan.names.has('requirements.txt') ? 'high' : 'medium',
    evidence,
    root: scan.root,
    warnings,
    commands: {
      tool: 'python',
      version: '3.12',
      workingDir,
      installCommand: install,
      buildCommand: 'python -m compileall -q .',
      testCommand: hasPytest ? 'python -m pytest -q' : 'python -m unittest discover -v',
      dockerfilePath: scan.names.has('Dockerfile') ? 'Dockerfile' : 'Dockerfile.cicd',
    },
    entrypoint: ['python', 'main.py'],
  }
}

async function goCandidate(scan: Scan, workingDir: string): Promise<LanguageCandidate> {
  const target = await hasGoCommand(scan.root)
  return {
    language: 'go',
    label: LANGUAGE_LABELS.go,
    confidence: 'high',
    evidence: ['go.mod', ...(target !== '.' ? [`command:${target}`] : [])],
    root: scan.root,
    warnings: target === './...' ? ['multiple cmd packages; the generic build target is ./...'] : [],
    commands: {
      tool: 'go',
      version: '1.23',
      workingDir,
      installCommand: 'go mod download',
      buildCommand: `go build -o /out/app ${target}`,
      testCommand: 'go test ./...',
      dockerfilePath: scan.names.has('Dockerfile') ? 'Dockerfile' : 'Dockerfile.cicd',
    },
    entrypoint: ['/app'],
  }
}

function readOptionalSafe(root: string, name: string): string | undefined {
  try {
    return readFileSync(join(root, name), 'utf8')
  } catch {
    return undefined
  }
}

export async function detectProject(projectPath: string, projectSubdir = ''): Promise<DetectionResult> {
  if (!projectPath || !isAbsolute(projectPath)) {
    throw new CicdError('INVALID_INPUT', 'projectPath must be absolute', 400)
  }
  const root = resolve(projectPath)
  const subdir = projectSubdir.trim().replaceAll('\\', '/')
  if (subdir.startsWith('/') || /^[A-Za-z]:/.test(subdir) || subdir.split('/').includes('..')) {
    throw new CicdError('INVALID_INPUT', 'projectSubdir must be a relative path inside projectPath', 400)
  }
  const scanRootPath = assertInside(root, subdir ? resolve(root, subdir) : root)
  const scan = await scanRoot(scanRootPath)
  const workingDir = subdir
  const candidates: LanguageCandidate[] = []
  if (scan.names.has('pom.xml')) candidates.push(mavenCandidate(scan, workingDir))
  if (scan.names.has('build.gradle') || scan.names.has('build.gradle.kts')) candidates.push(gradleCandidate(scan, workingDir))
  if (scan.names.has('package.json')) candidates.push(nodeCandidate(scan, workingDir))
  if (scan.names.has('pyproject.toml') || scan.names.has('requirements.txt') || scan.names.has('setup.py') || scan.names.has('pytest.ini')) {
    candidates.push(pythonCandidate(scan, workingDir))
  }
  if (scan.names.has('go.mod')) candidates.push(await goCandidate(scan, workingDir))

  const languages = new Set<CandidateLanguage>(candidates.map((candidate) => candidate.language))
  const requiresChoice = languages.size > 1
  return {
    projectPath: root,
    root: scanRootPath,
    candidates,
    requiresChoice,
    reason: candidates.length === 0
      ? 'no supported build marker found; choose custom and provide commands'
      : requiresChoice
        ? 'multiple language families detected; choose one explicitly'
        : 'single language family detected',
  }
}
