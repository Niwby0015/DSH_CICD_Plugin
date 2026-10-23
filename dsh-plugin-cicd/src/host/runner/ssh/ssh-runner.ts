import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CicdError } from '../../util/errors.js'
import type { ProcessRunner } from '../../git/process.js'
import { createSourceBundle } from '../source-bundle.js'
import { assertImageRef, parsePushDigest, parseRepoDigest, registryHost, type ImagePushResult } from '../../image/image-plan.js'
import type { KubernetesDeployInput, KubernetesDeployResult } from '../../deploy/types.js'
import type { BuildJob, BuildRunner, RunnerCapability, RunnerCheck, RunnerPreflight, RunnerResult, SshRunnerConfig } from '../types.js'
import { HostKeyManager } from './host-key.js'
import { SshAskpass, SshTransport } from './ssh-transport.js'
import { buildInvocation, cleanupInvocation, preflightInvocation, preparePushDirInvocation, prepareWorkspaceInvocation, pushImageInvocation, kubernetesDeployInvocation } from './remote-scripts.js'

const MIN_DISK_KB = 2 * 1024 * 1024

function parseChecks(output: string): Record<string, string> {
  const checks: Record<string, string> = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(git|docker|buildx|disk_kb)=(.*)$/)
    if (match) checks[match[1]!] = match[2]!.trim()
  }
  return checks
}

export function evaluatePreflight(output: string): RunnerPreflight {
  const checks = parseChecks(output)
  const dockerOk = Boolean(checks.docker && /\d+\.\d+/.test(checks.docker) && !/unknown command|missing/i.test(checks.docker))
  const buildxText = checks.buildx ?? 'missing'
  const buildxOk = /buildx/i.test(buildxText) && !/unknown command|missing|not a docker command/i.test(buildxText)
  const list: RunnerCheck[] = [
    { name: 'git', ok: Boolean(checks.git && /git version/i.test(checks.git)), detail: checks.git ?? 'missing' },
    { name: 'docker', ok: dockerOk, detail: checks.docker ?? 'missing' },
    {
      name: 'buildx',
      ok: buildxOk,
      optional: true,
      detail: buildxOk ? buildxText : `${buildxText} (optional; classic docker build can be used)`,
    },
    {
      name: 'disk',
      ok: Number(checks.disk_kb ?? 0) >= MIN_DISK_KB,
      detail: `${checks.disk_kb ?? 'unknown'} KB free under /tmp (minimum ${MIN_DISK_KB} KB)`,
    },
  ]
  return { ok: list.filter((check) => !check.optional).every((check) => check.ok), checks: list }
}

function remoteWorkspace(config: SshRunnerConfig, runId: string): string {
  const root = config.workspaceRoot.replace(/\/+$/, '')
  if (!root.startsWith('/') || root === '/' || root.includes('..') || root.split('/').filter(Boolean).length < 2 || !/^[A-Za-z0-9._/-]+$/.test(root)) {
    throw new CicdError('INVALID_INPUT', 'workspaceRoot must be an absolute path with at least two segments', 400)
  }
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new CicdError('INVALID_INPUT', 'runId contains unsupported characters', 400)
  return `${root}/${runId}`
}

export class SshBuildRunner implements BuildRunner {
  readonly kind = 'ssh' as const
  private readonly hostKeys: HostKeyManager
  private readonly transport: SshTransport

  constructor(
    private readonly runner: ProcessRunner,
    private readonly password: () => Promise<string | undefined>,
  ) {
    this.hostKeys = new HostKeyManager(runner)
    this.transport = new SshTransport(runner, new SshAskpass(password))
  }

  async capability(config?: SshRunnerConfig): Promise<RunnerCapability> {
    if (!config) return { kind: 'ssh', available: false, reason: 'SSH build host is not configured' }
    if (!config.host || !config.user) return { kind: 'ssh', available: false, reason: 'SSH host/user is incomplete' }
    return {
      kind: 'ssh',
      available: true,
      reason: 'OpenSSH transport configured; run preflight before building',
    }
  }

  async preflight(config: SshRunnerConfig, signal?: AbortSignal): Promise<RunnerPreflight> {
    if (!config.knownHostsPath) {
      throw new CicdError('INVALID_INPUT', 'knownHostsPath is required for SSH host-key pinning', 400)
    }
    const hostKey = await this.hostKeys.ensure({
      host: config.host,
      port: config.port,
      user: config.user,
      knownHostsPath: config.knownHostsPath,
      ...(config.expectedFingerprint ? { expectedFingerprint: config.expectedFingerprint } : {}),
    })
    const result = await this.transport.run(config, preflightInvocation(), {
      knownHostsPath: hostKey.knownHostsPath,
      ...(signal ? { signal } : {}),
      timeoutMs: 60_000,
    })
    const checks = evaluatePreflight(result.stdout)
    return checks
  }

  async build(config: SshRunnerConfig, job: BuildJob, signal?: AbortSignal): Promise<RunnerResult> {
    const workspace = job.workspace || remoteWorkspace(config, job.runId)
    if (!job.imageRef) throw new CicdError('INVALID_INPUT', 'imageRef is required for a build', 400)
    if (!config.knownHostsPath) throw new CicdError('INVALID_INPUT', 'knownHostsPath is required', 400)
    const bundle = await createSourceBundle(this.runner, job.projectPath, job.commitSha)
    const remoteBundle = `${workspace}.bundle`
    const logs: string[] = []
    let dockerfileTemp: string | undefined
    try {
      const hostKey = await this.hostKeys.ensure({
        host: config.host,
        port: config.port,
        user: config.user,
        knownHostsPath: config.knownHostsPath,
        ...(config.expectedFingerprint ? { expectedFingerprint: config.expectedFingerprint } : {}),
      })
      const upload = await this.transport.copyTo(config, bundle.path, remoteBundle, hostKey.knownHostsPath, {
        ...(signal ? { signal } : {}),
        timeoutMs: 180_000,
      })
      if (upload.code !== 0) throw new CicdError('SSH_COMMAND_FAILED', upload.stderr || 'source bundle upload failed', 502)

      const prepare = await this.transport.run(config, prepareWorkspaceInvocation(workspace, remoteBundle, job.commitSha, config.workspaceRoot), {
        knownHostsPath: hostKey.knownHostsPath,
        ...(signal ? { signal } : {}),
        timeoutMs: 180_000,
        ...(job.onLog ? { onData: (stream: 'stdout' | 'stderr', text: string) => job.onLog?.('source', stream, text) } : {}),
      })
      logs.push(prepare.stdout, prepare.stderr)
      if (prepare.code !== 0) throw new CicdError('SSH_COMMAND_FAILED', prepare.stderr || 'remote checkout failed', 502)
      job.onStage?.('source', 'succeeded')

      if (job.buildPlan.dockerfileSource === 'generated') {
        dockerfileTemp = await mkdtemp(join(tmpdir(), 'dsh-cicd-dockerfile-'))
        const local = join(dockerfileTemp, 'Dockerfile')
        await writeFile(local, job.buildPlan.dockerfile, 'utf8')
        const remote = `${workspace}/${job.buildPlan.dockerfilePath}`
        const copied = await this.transport.copyTo(config, local, remote, hostKey.knownHostsPath, {
          ...(signal ? { signal } : {}),
          timeoutMs: 60_000,
        })
        if (copied.code !== 0) throw new CicdError('SSH_COMMAND_FAILED', copied.stderr || 'Dockerfile upload failed', 502)
      }

      job.onStage?.('build', 'running')
      job.onStage?.('image', 'running')
      const build = await this.transport.run(config, buildInvocation({
        workspace,
        commitSha: job.commitSha,
        toolchainImage: job.buildPlan.toolchainImage,
        installCommand: job.buildPlan.installCommand,
        buildCommand: job.buildPlan.buildCommand,
        testCommand: job.buildPlan.testCommand,
        dockerfilePath: job.buildPlan.dockerfilePath,
        imageRef: job.imageRef,
      }), {
        knownHostsPath: hostKey.knownHostsPath,
        ...(signal ? { signal } : {}),
        timeoutMs: 1_800_000,
        ...(job.onLog ? { onData: (stream: 'stdout' | 'stderr', text: string) => job.onLog?.('build', stream, text) } : {}),
      })
      logs.push(build.stdout, build.stderr)
      if (build.code !== 0) throw new CicdError('SSH_COMMAND_FAILED', build.stderr || build.stdout || 'remote build failed', 502)
      job.onStage?.('build', 'succeeded')
      job.onStage?.('image', 'succeeded')
      const digest = [...build.stdout.matchAll(/sha256:[0-9a-f]{64}/gi)].at(-1)?.[0] ?? ''
      return {
        ok: true,
        workspace,
        commitSha: job.commitSha,
        imageRef: job.imageRef,
        imageDigest: digest,
        logs: logs.join('\n').split(/\r?\n/).filter(Boolean),
      }
    } finally {
      await bundle.cleanup().catch(() => {})
      if (dockerfileTemp) await rm(dockerfileTemp, { recursive: true, force: true }).catch(() => {})
      await this.cleanup(config, workspace).catch(() => {})
      await this.cleanup(config, remoteBundle).catch(() => {})
    }
  }

  async pushImage(
    config: SshRunnerConfig,
    imageRef: string,
    username: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<ImagePushResult> {
    if (!config.knownHostsPath) throw new CicdError('INVALID_INPUT', 'knownHostsPath is required', 400)
    if (!username || !password) throw new CicdError('REGISTRY_AUTH_FAILED', 'registry username/password are not configured', 401)
    try {
      assertImageRef(imageRef)
    } catch {
      throw new CicdError('INVALID_INPUT', `invalid image reference: ${imageRef}`, 400)
    }
    const registry = registryHost(imageRef)
    const root = config.workspaceRoot.replace(/\/+$/, '')
    const remoteDir = `${root}/docker-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-cicd-registry-'))
    let hostKey: { knownHostsPath: string } | undefined
    try {
      hostKey = await this.hostKeys.ensure({
        host: config.host,
        port: config.port,
        user: config.user,
        knownHostsPath: config.knownHostsPath,
        ...(config.expectedFingerprint ? { expectedFingerprint: config.expectedFingerprint } : {}),
      })
      const prepared = await this.transport.run(config, preparePushDirInvocation(remoteDir, root), {
        knownHostsPath: hostKey.knownHostsPath,
        ...(signal ? { signal } : {}),
        timeoutMs: 60_000,
      })
      if (prepared.code !== 0) throw new CicdError('REGISTRY_PUSH_FAILED', prepared.stderr || 'could not prepare remote docker config', 502)
      const configPath = join(tempDir, 'config.json')
      const auth = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
      const existing = await this.transport.run(config, {
        script: `if [ -f "$HOME/.docker/config.json" ]; then cat "$HOME/.docker/config.json"; fi`,
        args: [],
      }, {
        knownHostsPath: hostKey.knownHostsPath,
        ...(signal ? { signal } : {}),
        timeoutMs: 30_000,
      })
      let baseConfig: Record<string, unknown> = {}
      if (existing.code === 0 && existing.stdout.trim()) {
        try {
          const parsed: unknown = JSON.parse(existing.stdout)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) baseConfig = parsed as Record<string, unknown>
        } catch {
          // A malformed user config must not prevent an explicit registry push.
        }
      }
      const existingAuths = baseConfig.auths && typeof baseConfig.auths === 'object' && !Array.isArray(baseConfig.auths)
        ? baseConfig.auths as Record<string, unknown>
        : {}
      await writeFile(configPath, JSON.stringify({
        ...baseConfig,
        auths: { ...existingAuths, [registry]: { auth } },
      }), { encoding: 'utf8', mode: 0o600 })
      const copied = await this.transport.copyTo(config, configPath, `${remoteDir}/config.json`, hostKey.knownHostsPath, {
        ...(signal ? { signal } : {}),
        timeoutMs: 60_000,
      })
      if (copied.code !== 0) throw new CicdError('REGISTRY_PUSH_FAILED', copied.stderr || 'could not upload remote docker config', 502)
      const result = await this.transport.run(config, pushImageInvocation(remoteDir, imageRef), {
        knownHostsPath: hostKey.knownHostsPath,
        ...(signal ? { signal } : {}),
        timeoutMs: 600_000,
      })
      const output = `${result.stdout}\n${result.stderr}`
      if (result.code !== 0) {
        if (/unauthorized|authentication required|denied|forbidden/i.test(output)) {
          throw new CicdError('REGISTRY_AUTH_FAILED', 'registry authentication failed', 401)
        }
        if (/denied|forbidden/i.test(output)) {
          throw new CicdError('REGISTRY_PUSH_DENIED', 'registry rejected the push', 403)
        }
        throw new CicdError('REGISTRY_PUSH_FAILED', output || 'docker push failed', 502)
      }
      const pushDigest = parsePushDigest(output)
      const repoLine = output.split(/\r?\n/).reverse().find((line) => line.trim().startsWith('[')) ?? output
      const repoDigest = parseRepoDigest(repoLine)
      const digest = pushDigest || repoDigest
      if (!digest) throw new CicdError('REGISTRY_DIGEST_MISSING', 'docker push did not report a digest', 502)
      return {
        imageRef,
        digest,
        verified: Boolean(pushDigest && repoDigest && pushDigest === repoDigest),
        logs: output.split(/\r?\n/).filter(Boolean),
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {})
      if (hostKey) await this.cleanup(config, remoteDir).catch(() => {})
    }
  }

  async deployKubernetes(
    config: SshRunnerConfig,
    input: KubernetesDeployInput,
    signal?: AbortSignal,
  ): Promise<KubernetesDeployResult> {
    if (!config.knownHostsPath) throw new CicdError('INVALID_INPUT', 'knownHostsPath is required', 400)
    const hostKey = await this.hostKeys.ensure({
      host: config.host,
      port: config.port,
      user: config.user,
      knownHostsPath: config.knownHostsPath,
      ...(config.expectedFingerprint ? { expectedFingerprint: config.expectedFingerprint } : {}),
    })
    const result = await this.transport.run(config, kubernetesDeployInvocation(input), {
      knownHostsPath: hostKey.knownHostsPath,
      ...(signal ? { signal } : {}),
      timeoutMs: (input.timeoutSeconds + 60) * 1000,
    })
    const output = `${result.stdout}\n${result.stderr}`
    if (result.code === 3 || result.code === 4) {
      throw new CicdError('KUBERNETES_UNAVAILABLE', output || 'kubectl/kubeconfig is unavailable on the build host', 503)
    }
    if (result.code !== 0) {
      throw new CicdError('KUBERNETES_DEPLOY_FAILED', output || 'kubectl deployment failed', 502)
    }
    const matches = [...output.matchAll(/(\d+)\/(\d+) (\S+)/g)]
    const last = matches.at(-1)
    if (!last) throw new CicdError('KUBERNETES_DEPLOY_FAILED', 'cannot parse kubectl rollout status', 502)
    const readyReplicas = Number(last[1])
    const desiredReplicas = Number(last[2])
    if (!Number.isFinite(readyReplicas) || !Number.isFinite(desiredReplicas) || readyReplicas < desiredReplicas) {
      throw new CicdError('KUBERNETES_DEPLOY_FAILED', `deployment is not ready: ${last[0]}`, 502)
    }
    return {
      namespace: input.namespace,
      deployment: input.deployment,
      image: last[3]!,
      readyReplicas,
      desiredReplicas,
      httpStatus: Number(output.match(/HTTP=(\d+)/)?.[1] ?? 0),
      logs: output.split(/\r?\n/).filter(Boolean),
    }
  }

  async cleanup(config: SshRunnerConfig, workspace: string, signal?: AbortSignal): Promise<void> {
    if (!config.knownHostsPath) throw new CicdError('INVALID_INPUT', 'knownHostsPath is required', 400)
    const hostKey = await this.hostKeys.ensure({
      host: config.host,
      port: config.port,
      user: config.user,
      knownHostsPath: config.knownHostsPath,
      ...(config.expectedFingerprint ? { expectedFingerprint: config.expectedFingerprint } : {}),
    })
    await this.transport.run(config, cleanupInvocation(workspace, config.workspaceRoot), {
      knownHostsPath: hostKey.knownHostsPath,
      ...(signal ? { signal } : {}),
      timeoutMs: 60_000,
    })
  }
}
