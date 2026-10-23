import type { BuildPlan } from '../../language/types.js'

export interface RemoteInvocation {
  script: string
  args: string[]
}

export function encodeArg(value: string): string {
  // Empty command is common (for example a Node project without a build
  // script). OpenSSH concatenates remote command words and drops an empty
  // argument, shifting every later positional parameter. Encode empty as a
  // non-empty sentinel instead.
  return value === '' ? '-' : Buffer.from(value, 'utf8').toString('base64')
}

export function decodeArgForTest(value: string): string {
  return value === '-' ? '' : Buffer.from(value, 'base64').toString('utf8')
}

const DECODE_FN = `decode() { if [ "$1" = "-" ]; then printf '%s' ''; else printf '%s' "$1" | base64 -d; fi; }`

/** Static remote preflight; every value is printed with a marker for parsing. */
export function preflightInvocation(): RemoteInvocation {
  return {
    script: `set -u
if command -v git >/dev/null 2>&1; then git_version=$(git --version 2>&1) || git_version=missing; else git_version=missing; fi
printf 'git=%s\\n' "$git_version"
if command -v docker >/dev/null 2>&1; then docker_version=$(docker version --format '{{.Server.Version}}' 2>&1) || docker_version=missing; else docker_version=missing; fi
printf 'docker=%s\\n' "$(printf '%s' "$docker_version" | tr '\\n' ' ')"
if command -v docker >/dev/null 2>&1; then buildx_version=$(docker buildx version 2>&1) || buildx_version=missing; else buildx_version=missing; fi
printf 'buildx=%s\\n' "$(printf '%s' "$buildx_version" | tr '\\n' ' ')"
disk_kb=$(df -Pk /tmp 2>/dev/null | awk 'NR==2 {print $4}')
printf 'disk_kb=%s\\n' "\${disk_kb:-unknown}"
`,
    args: [],
  }
}

function runLine(label: string, encoded: string): string {
  return `CMD=$(decode ${encoded})
if [ -n "$CMD" ]; then
  printf '== ${label} ==\\n'
  docker run --rm -v "$WS:/src" -w /src "$TOOL" sh -c "$CMD"
fi`
}

export function buildInvocation(input: {
  workspace: string
  commitSha: string
  toolchainImage: string
  installCommand: string
  buildCommand: string
  testCommand: string
  dockerfilePath: string
  imageRef: string
}): RemoteInvocation {
  const args = [
    input.workspace,
    input.commitSha,
    input.toolchainImage,
    input.installCommand,
    input.buildCommand,
    input.testCommand,
    input.dockerfilePath,
    input.imageRef,
  ].map(encodeArg)
  return {
    script: `set -eu
${DECODE_FN}
WS=$(decode "$1")
SHA=$(decode "$2")
TOOL=$(decode "$3")
DOCKERFILE=$(decode "$7")
IMAGE=$(decode "$8")
cd "$WS"
test "$(git rev-parse HEAD)" = "$SHA"
${runLine('install', '$4')}
${runLine('build', '$5')}
${runLine('test', '$6')}
test -f "$DOCKERFILE"
docker build -f "$DOCKERFILE" -t "$IMAGE" .
docker image inspect --format '{{.Id}}' "$IMAGE"
`,
    args,
  }
}

export function preparePushDirInvocation(dir: string, workspaceRoot: string): RemoteInvocation {
  return {
    script: `set -eu
${DECODE_FN}
DIR=$(decode "$1")
ROOT=$(decode "$2")
case "$ROOT" in /|"") printf 'invalid workspace root\\n' >&2; exit 2 ;; esac
case "$DIR" in "$ROOT"/*) ;; *) printf 'refusing docker config outside %s: %s\\n' "$ROOT" "$DIR" >&2; exit 2 ;; esac
mkdir -p "$DIR"
chmod 700 "$DIR"
`,
    args: [encodeArg(dir), encodeArg(workspaceRoot)],
  }
}

export function pushImageInvocation(dir: string, imageRef: string): RemoteInvocation {
  return {
    script: `set -eu
${DECODE_FN}
DIR=$(decode "$1")
IMAGE=$(decode "$2")
export DOCKER_CONFIG="$DIR"
chmod 600 "$DIR/config.json"
docker push "$IMAGE"
docker image inspect --format '{{json .RepoDigests}}' "$IMAGE"
`,
    args: [encodeArg(dir), encodeArg(imageRef)],
  }
}

export function kubernetesDeployInvocation(input: {
  namespace: string
  deployment: string
  manifest: string
  servicePort: number
  healthPath: string
  timeoutSeconds: number
  localPort: number
}): RemoteInvocation {
  return {
    script: `set -eu
${DECODE_FN}
NS=$(decode "$1")
NAME=$(decode "$2")
MANIFEST=$(decode "$3")
SERVICE_PORT=$(decode "$4")
HEALTH=$(decode "$5")
TIMEOUT=$(decode "$6")
LOCAL_PORT=$(decode "$7")
export KUBECONFIG="\${KUBECONFIG:-$HOME/.kube/config}"
test -f "$KUBECONFIG" || { printf 'kubeconfig not found: %s\\n' "$KUBECONFIG" >&2; exit 3; }
command -v kubectl >/dev/null 2>&1 || { printf 'kubectl not found\\n' >&2; exit 4; }
printf '%s' "$MANIFEST" | kubectl apply -f -
kubectl -n "$NS" rollout status "deployment/$NAME" --timeout="\${TIMEOUT}s"
kubectl -n "$NS" get deployment "$NAME" -o jsonpath='{.status.readyReplicas}/{.spec.replicas} {.spec.template.spec.containers[0].image}'
printf '\\n'
kubectl -n "$NS" port-forward "service/$NAME" "$LOCAL_PORT:$SERVICE_PORT" >/tmp/dsh-cicd-port-forward.log 2>&1 &
PF=$!
trap 'kill "$PF" 2>/dev/null || true' EXIT
HTTP=000
n=0
while [ "$n" -lt 20 ]; do
  HTTP=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$LOCAL_PORT$HEALTH" 2>/dev/null || echo 000)
  case "$HTTP" in 2??|3??) break ;; esac
  n=$((n+1))
  sleep 1
done
kill "$PF" 2>/dev/null || true
wait "$PF" 2>/dev/null || true
printf 'HTTP=%s\\n' "$HTTP"
case "$HTTP" in 2??|3??) exit 0 ;; *) printf 'health check failed: HTTP %s\\n' "$HTTP" >&2; exit 5 ;; esac
`,
    args: [
      encodeArg(input.namespace),
      encodeArg(input.deployment),
      encodeArg(input.manifest),
      encodeArg(String(input.servicePort)),
      encodeArg(input.healthPath),
      encodeArg(String(input.timeoutSeconds)),
      encodeArg(String(input.localPort)),
    ],
  }
}

export function cleanupInvocation(workspace: string, workspaceRoot = '/tmp/dsh-cicd'): RemoteInvocation {
  return {
    script: `set -eu
${DECODE_FN}
WS=$(decode "$1")
ROOT=$(decode "$2")
case "$ROOT" in /|"") printf 'invalid workspace root\\n' >&2; exit 2 ;; esac
case "$WS" in "$ROOT"/*) rm -rf -- "$WS" ;; *) printf 'refusing to remove workspace outside %s: %s\\n' "$ROOT" "$WS" >&2; exit 2 ;; esac
`,
    args: [encodeArg(workspace), encodeArg(workspaceRoot)],
  }
}

export function prepareWorkspaceInvocation(
  workspace: string,
  bundlePath: string,
  commitSha: string,
  workspaceRoot = '/tmp/dsh-cicd',
): RemoteInvocation {
  return {
    script: `set -eu
${DECODE_FN}
WS=$(decode "$1")
BUNDLE=$(decode "$2")
SHA=$(decode "$3")
ROOT=$(decode "$4")
case "$ROOT" in /|"") printf 'invalid workspace root\\n' >&2; exit 2 ;; esac
case "$WS" in "$ROOT"/*) ;; *) printf 'refusing workspace outside %s: %s\\n' "$ROOT" "$WS" >&2; exit 2 ;; esac
rm -rf -- "$WS"
mkdir -p "$(dirname "$WS")"
git clone --no-checkout "$BUNDLE" "$WS"
cd "$WS"
git checkout --detach "$SHA"
test "$(git rev-parse HEAD)" = "$SHA"
rm -f "$BUNDLE"
printf 'checked-out=%s\\n' "$(git rev-parse HEAD)"
`,
    args: [encodeArg(workspace), encodeArg(bundlePath), encodeArg(commitSha), encodeArg(workspaceRoot)],
  }
}

export function planCommands(plan: BuildPlan): { install: string; build: string; test: string } {
  return { install: plan.installCommand, build: plan.buildCommand, test: plan.testCommand }
}

