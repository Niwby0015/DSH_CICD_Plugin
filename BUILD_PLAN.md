# DSH CI/CD 多语言流水线插件：构建计划

> 基线版本：DeepSeek Harness **0.2.1-rc.2**  
> 勘察日期：2026-10-22  
> 当前工作区：`<workspace>/DSH_CICD_Plugin`  
> 当前 DSH profile：`desktop`  
> 目标：独立插件，不修改 DSH 核心；先跑通 GitHub → SSH Runner → 语言构建 → 镜像推送 → SSH 部署 → Kubernetes 验证的完整闭环。
>
> **当前进度（2026-10-23）：P0–P4 已完成，P5 本地 registry 推送/digest 通过，P6 单节点 kubectl Deployment/rollout/HTTP 通过。** P4 取消/实时日志、P5 Docker Hub/私有 registry、P6 Helm/Service/Ingress/imagePullSecret 仍缺；P8 Agent 工具按当前范围移除。收尾验收见 [`dsh-plugin-cicd/docs/ACCEPTANCE.md`](dsh-plugin-cicd/docs/ACCEPTANCE.md)。

---

## 1. 结论先行

### 1.1 可行性结论

**可以做，但不能把“插件写完”当成“验收完成”。**

- DSH 当前版本具备本项目需要的扩展点：Host 插件、配置、认证路由、Agent 工具、SQLite 持久化、子进程、Web UI 插槽、凭据存储。
- 当前版本**没有可直接复用的 SSH 远程执行服务**。按需求允许的兜底方案，实现一个跨平台 OpenSSH 进程适配器，而不是假设 DSH 自带 SSH。
- 当前机器缺少端到端验收所需的若干外部条件：Docker daemon 未运行、Helm 未安装、没有 Kubernetes context、没有远端 Linux 构建机、没有可推送的 GitHub 仓库。代码可以先完成，真实 E2E 必须等这些条件具备后才能签字。
- 首个版本只承诺 **SSH Runner** 是可用执行器；Jenkins、Drone 只保留接口和“未实现”状态，绝不显示虚假成功。

### 1.2 建议的交付策略

分两条线推进：

1. **不依赖外部基础设施的能力**：插件骨架、UI、Git 本地操作、语言识别、状态持久化、日志脱敏、Agent 工具、单元/集成测试。这些可以立即完成并验证。
2. **依赖外部环境的能力**：真实 GitHub 推送、远端构建、镜像仓库、SSH 部署、Kubernetes rollout。代码与契约测试先完成，环境就绪后做真实 E2E，并把结果写进验收报告。

---

## 2. 已完成的代码库与版本勘察

### 2.1 实际版本与环境

| 项目 | 实际值 | 说明 |
|---|---|---|
| DSH 产品版本 | `0.2.1.0` / `0.2.1-rc.2` | `DeepSeek Harness.exe` 文件版本 |
| DSH 运行时包 | `@deepseek-ai/dsh-desktop-runtime@0.2.1-rc.2` | 来自 `app.asar` 内 `package.json` |
| Electron | `44.7.0` | DSH 宿主运行时 |
| 宿主 Node | `24.21.0` | `node:sqlite` 可用 |
| 命令行 Node | `24.13.0` | 与宿主版本不同，测试时需注意 |
| 操作系统 | Windows | 本地工作区；构建/部署目标是 Linux |
| DSH profile | `desktop` | 已有两个 link 插件 |
| OpenSSH 客户端 | `9.5p1` | 可用于 SSH Runner |
| Git | `2.54.0.windows.1` | 本地 Git 服务 |
| Go | `1.26.1 windows/amd64` | 可用于 Go 示例 |
| Python | `3.11.7` | 可用于 Python 示例 |
| Node | `24.13.0` | 可用于 Node 示例 |
| pnpm | `11.4.0` | 插件构建与 profile 安装 |
| kubectl | `v1.36.1` 客户端 | 仅客户端，无 context |
| Docker CLI | `29.7.2` | **daemon 未运行** |
| Helm | 未安装 | 部署验收阻塞 |
| Java / Maven / Gradle | 未安装 | Java 示例验收阻塞 |
| SSH 服务端 | 未安装 | 本地 SSH E2E 暂不可用 |

### 2.2 DSH 插件扩展点（已按当前安装内容核对）

| 能力 | 当前实现方式 | 结论 |
|---|---|---|
| Host 插件入口 | `export function apply(ctx, config)`，可导出 `inject`、`Config` | 使用 |
| 插件包/层 | `package.json` 的 `dsh.bundle.patch` + `cordis.patch.yml` | 使用 |
| 配置 | `@deepseek-ai/schemastery` 的 `z.object(...)` | 使用，仅放非敏感全局配置 |
| 认证页面路由 | `ctx.connection.fetch.register({ path, methods, requestBody, fetch })` | 使用；不使用无认证的 `ctx.webServer` 裸路由 |
| Agent 工具 | `ctx.tools.register(defineTool({ name, description, parameters, output, execute }))` | 使用；工具复用同一个 PipelineService |
| 浏览器 UI | Client 模块加载器 + `ctx.slots.inject/register` | 使用 |
| 侧边栏入口 | slot `sidebar.panellist` | 使用 |
| 主内容页 | slot `main`，key 为插件名 | 使用 |
| 国际化 | `ctx.locale.register` + locale JSON | 使用 |
| 凭据 | `ctx.credentials.describe/resolve/set/unset`；record 读写 | 使用；不在插件配置/DB 中保存秘密值 |
| 持久化 | 当前 DSH 提供 `ctx.storageDomain`/`ctx.storage`；`node:sqlite` 也可用 | 本项目选 SQLite，原因见 4.3 |
| 子进程 | `ctx.subprocess.resolveExecutable/spawn`，argv 显式、支持 stdio、取消、托管进程范围 | 使用；SSH Runner 的唯一本地进程入口 |
| SSH 远程执行 | 当前版本无专门服务 | 实现 OpenSSH 适配器 |

### 2.3 现有插件参考

| 插件 | 可复用经验 |
|---|---|
| `dsh-plugin-sandbox-observability` | Host `apply`、`ctx.inject`、`ctx.connection.fetch` 认证路由、`sidebar.panellist` + `main` 页面、`node:sqlite` 持久化、客户端轮询、主题 token |
| `@local/dsh-deepseek-quota` | Client 模块加载器格式、`ctx.locale.register`、`ctx.slots.inject`、可选服务注入、`shell.overlay` |
| DSH 自带 `cordis-plugin-development` 文档 | 包清单、bundle patch、locale/icon、Host/Client 导出形式、安装与 HMR 注意事项 |
| DSH 自带 `dsh-tools` 文档 | `defineTool`、参数 schema、`exec.signal`、工具执行管线 |
| DSH 自带 `dsh-credentials` 文档 | 引用与 record 的读写、永不返回秘密值 |
| DSH 自带 `dsh-subprocess` 文档 | 显式 argv、stdio、`done`、`terminate`、`waitForExit` |

### 2.4 勘察中发现的平台事实

1. 运行时上下文给出的源码路径是 `D:\DSH\resources\app.asar\dsh`，但实际目录是 `D:\DSH\resources\app.asar`（归档文件）与 `D:\DSH\resources\app.asar.unpacked\dsh`（仅原生模块）。插件文档、类型和内置包在 `app.asar` 内，需要用 ASAR 解析读取，不能直接当普通目录访问。
2. Windows 上的 DSH 使用 PowerShell 5.1 作为默认 shell；`ctx.subprocess` 的 argv 语义可以避免 shell 引号问题。插件自身不要把“本地命令”写成 `cmd.exe /c` 字符串。
3. 当前 DSH 进程没有暴露 `plugin_manager` 工具给这个会话；安装验收需要走 Web 的 Plugins 页面，或用 `dsh plugin --profile desktop ...` 加 profile 层的规范安装步骤。不能假设存在某个隐藏工具。
4. 现有插件已经证明 `node:sqlite` 在 DSH 宿主内可用；但 `node:sqlite` 不是 DSH 的服务接口，而是 Node 运行时能力。它适合作为插件私有状态存储，不能用于存秘密。

---

## 3. 范围、边界与不承诺项

### 3.1 首个完整版本必须交付

- 独立 DSH 插件包，能通过构建、类型检查、测试并加载到 Web UI。
- CI/CD 侧边栏入口和完整管理页面。
- Git 状态检查、变更预览、敏感文件拦截、提交、推送、精确 SHA 记录。
- Java Maven、Java Gradle、Node.js、Python、Go、自定义项目的识别与构建模板。
- 可替换的 Build Runner 接口 + 内置 SSH Runner。
- 远程构建机检查、隔离工具链容器、镜像构建、镜像推送。
- SSH 构建/部署环境分离、严格主机密钥校验、连接测试。
- Helm / kubectl / 模板三种部署方式，rollout 与镜像验证。
- 阶段状态机、日志、超时、取消、清理、重启恢复、历史记录。
- Agent 工具：查询、校验、触发、读取、取消。
- 生产部署审批闸门。
- 完整测试、示例项目、安装说明、配置示例、已知限制。

### 3.2 首个版本明确不做

- Jenkins、Drone 的真实适配器。接口保留，状态显示“未实现/不可用”。
- 在 DSH 宿主上直接编译 Java/Node/Python/Go（不要求宿主安装全部编译器）。
- 在 Kubernetes 每个节点假设有 Docker daemon。
- GitHub App / OAuth 登录；首个版本用 PAT 或本机 SSH key/agent。
- 多集群批量发布、蓝绿/金丝雀发布、服务网格集成。
- 自动回滚作为默认行为；默认关闭，且只在明确配置时执行。
- 镜像签名、SBOM、SLSA provenance（可作为后续增强）。
- 对恶意仓库的强沙箱保证；容器隔离是工程边界，不是安全边界。
- Windows 作为远程构建机；SSH Runner 只支持 Linux 构建机。

---

## 4. 总体架构

### 4.1 职责分离

```text
DSH 工作区 / 本地 Git 项目
        │
        │ 本地 Git 检查、提交、推送、精确 SHA
        ▼
   PipelineService（状态机、持久化、审批、日志、取消）
        │
        ├── GitService
        ├── LanguageDetector / BuildPlanner
        ├── RunnerRegistry ──► SshBuildRunner（首个可用）
        │                         │
        │                         ├── SshTransport（OpenSSH）
        │                         ├── 远程 Git checkout（精确 SHA）
        │                         ├── 语言工具链容器：编译/测试
        │                         └── 镜像构建后端：Buildx / BuildKit
        ├── ImagePublisher（远端 docker login/build/push、digest）
        ├── KubernetesDeployer（独立 SSH 目标）
        └── Store / Redactor / Approval
```

**关键原则**

- 本地工作区、远程构建机、Kubernetes 部署目标是三个独立概念，分别配置、分别测试、分别记录。
- 构建机和部署机可以是同一台，但配置记录不合并；UI 上明确显示“当前构建机”和“当前部署目标”。
- 流水线编排不依赖 SSH；Runner 只负责“在某个执行器里完成构建与镜像推送”。以后接 Jenkins/Drone 时替换 Runner，不改状态机和 UI。
- UI 和 Agent 工具都调用同一个 `PipelineService`，不各自实现一套执行路径。

### 4.2 建议目录结构

```text
dsh-plugin-cicd/
├─ package.json
├─ tsconfig.json
├─ build.mjs
├─ cordis.patch.yml
├─ icon.svg
├─ locale/
│  ├─ zh.json
│  └─ en.json
├─ src/
│  ├─ host/
│  │  ├─ index.ts                 # 插件入口，组装服务
│  │  ├─ config.ts                # Schemastery 全局配置
│  │  ├─ context.ts               # 可选服务注入、能力探测
│  │  ├─ routes/
│  │  │  ├─ index.ts              # 认证路由注册
│  │  │  ├─ pipelines.ts
│  │  │  ├─ runs.ts
│  │  │  ├─ environments.ts
│  │  │  └─ credentials.ts
│  │  ├─ domain/
│  │  │  ├─ types.ts              # PipelineDefinition / Run / Stage DTO
│  │  │  ├─ state-machine.ts
│  │  │  ├─ pipeline-service.ts
│  │  │  ├─ approval-service.ts
│  │  │  └─ validation.ts
│  │  ├─ git/
│  │  │  ├─ git-service.ts
│  │  │  ├─ git-status.ts
│  │  │  ├─ sensitive-scan.ts
│  │  │  ├─ auth.ts               # GIT_ASKPASS、临时凭据
│  │  │  └─ source-bundle.ts      # 精确 SHA 的远端传输
│  │  ├─ language/
│  │  │  ├─ detector.ts
│  │  │  ├─ maven.ts
│  │  │  ├─ gradle.ts
│  │  │  ├─ node.ts
│  │  │  ├─ python.ts
│  │  │  ├─ go.ts
│  │  │  ├─ custom.ts
│  │  │  └─ dockerfile-templates.ts
│  │  ├─ runner/
│  │  │  ├─ types.ts              # BuildRunner 统一接口
│  │  │  ├─ registry.ts
│  │  │  ├─ ssh/
│  │  │  │  ├─ ssh-runner.ts
│  │  │  │  ├─ ssh-transport.ts
│  │  │  │  ├─ host-key.ts
│  │  │  │  ├─ remote-scripts.ts
│  │  │  │  └─ cleanup.ts
│  │  │  └─ future/               # Jenkins/Drone 仅接口占位，不显示可用
│  │  ├─ image/
│  │  │  ├─ image-plan.ts
│  │  │  ├─ tag.ts
│  │  │  ├─ docker-auth.ts
│  │  │  └─ push.ts
│  │  ├─ deploy/
│  │  │  ├─ kubernetes-service.ts
│  │  │  ├─ helm.ts
│  │  │  ├─ kubectl.ts
│  │  │  ├─ manifest-template.ts
│  │  │  ├─ rollout.ts
│  │  │  └─ rollback.ts
│  │  ├─ store/
│  │  │  ├─ sqlite-store.ts
│  │  │  ├─ schema.ts
│  │  │  ├─ migrations.ts
│  │  │  └─ run-repository.ts
│  │  ├─ security/
│  │  │  ├─ redactor.ts
│  │  │  ├─ secret-refs.ts
│  │  │  ├─ input-validation.ts
│  │  │  └─ command-policy.ts
│  │  ├─ tools/
│  │  │  └─ cicd-tools.ts
│  │  └─ util/
│  │     ├─ logger.ts
│  │     ├─ timeouts.ts
│  │     ├─ posix-path.ts
│  │     └─ errors.ts
│  └─ client/
│     ├─ index.tsx                # 模块加载器入口
│     ├─ api.ts
│     ├─ types.ts
│     ├─ components/
│     │  ├─ PageShell.tsx
│     │  ├─ PipelineGraph.tsx
│     │  ├─ StageDetail.tsx
│     │  ├─ LogViewer.tsx
│     │  ├─ Forms.tsx
│     │  └─ Controls.tsx
│     └─ pages/
│        ├─ PipelinesPage.tsx
│        ├─ PipelineEditor.tsx
│        ├─ PipelineDetail.tsx
│        ├─ EnvironmentsPage.tsx
│        ├─ CredentialsPage.tsx
│        └─ HistoryPage.tsx
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ fixtures/
│  └─ e2e/
├─ examples/
│  ├─ java-maven/
│  ├─ node/
│  ├─ python/
│  └─ go/
└─ docs/
   ├─ INSTALL.md
   ├─ CONFIGURATION.md
   ├─ SECURITY.md
   └─ VERIFICATION.md
```

**约束**：入口、路由、服务、Git、语言、Runner、镜像、部署、存储、安全、工具、UI 分别落在独立模块；`pipeline-service.ts` 只做编排，不实现 SSH 或 Docker 细节。

### 4.3 持久化设计

**选择：`node:sqlite`（DatabaseSync + WAL），数据库位于 `<DSH_HOME>/cicd/cicd.db`。**

理由：

- 流水线运行、阶段、日志是高频追加、按 run/stage 查询的数据，关系模型比 KV 更合适。
- `ctx.storageDomain` 适合 schema 校验的 KV/状态，不适合大量日志分页和按阶段聚合；当前版本也没有现成的日志追加设施。
- `node:sqlite` 在 DSH Electron 的 Node 24.21 中可用，且已有 DSH 插件使用，风险可控。
- 秘密不进入 SQLite；秘密只通过 `ctx.credentials` 引用。

建议表：

```text
pipelines(id, name, config_json, config_version, created_at, updated_at, last_run_id)
runs(id, pipeline_id, trigger, status, commit_sha, branch, image_ref, image_digest,
     runner_kind, target_env_id, namespace, config_snapshot_json, plan_hash,
     started_at, finished_at, error_code, error_message, cleanup_state, cleanup_message)
stages(id, run_id, key, ordinal, status, started_at, finished_at, exit_code,
       error_code, error_message, detail_json)
stage_logs(id, run_id, stage_key, seq, ts, stream, text)
events(id, run_id, ts, kind, payload_json)
approvals(id, run_id, env_id, status, plan_hash, image_ref, commit_sha,
          requested_by, approved_by, created_at, expires_at)
environments(id, kind, name, config_json, created_at, updated_at)
credentials(id, kind, label, ref, created_at)   -- 只存引用名，不存值
```

- 每次 run 保存**配置快照**，之后编辑流水线不会改变历史记录的含义。
- 启动时把 `queued/running/cancelling` 的 run/stage 标记为 `interrupted`，并写明“DSH 重启导致中断”；绝不在重启后显示为仍在运行。
- 日志写入前脱敏；按 run 设置总字节上限，超出后截断并插入明确标记。
- 数据库目录/文件权限尽量收紧；Windows 下不伪造 POSIX 权限检查。

### 4.4 状态机

```text
Stage:
  pending ──► running ──► succeeded
                    ├──► failed
                    └──► cancelling ──► cancelled
  pending ──► skipped          （上游失败/审批拒绝）
  running ──► interrupted      （DSH 重启恢复）

Run:
  queued ──► running ──► awaiting_approval ──► running ──► succeeded
                    ├──► failed
                    └──► cancelling ──► cancelled
  running ──► interrupted
```

主阶段固定为：

```text
source (GitHub)
  → build (远程 checkout + 语言识别 + 编译 + 测试)
  → image (镜像构建)
  → push (镜像推送)
  → deploy (SSH 连接 + Helm/kubectl/模板)
  → verify (rollout/Pod/镜像验证)
  → report (结果报告)
```

- `source` 包含 Git 状态检查、敏感文件检查、提交、推送、SHA 解析和远端 SHA 校验。
- `build` 内部有子步骤：`checkout`、`detect`、`compile`、`test`；UI 在主节点下显示子步骤状态、退出码和耗时。
- 上游失败后，后续构建/部署阶段进入 `skipped`；`report` 作为汇总阶段仍执行，但不能改变失败事实。
- 每个阶段独立记录 `startedAt/endedAt/durationMs/exitCode/errorCode/errorMessage` 和日志。
- 取消是协作式的：设置取消标志、触发 `AbortSignal`、终止本地 SSH、再尝试远端进程组终止和目录清理；清理失败单独记录，不谎报“已完全清理”。

### 4.5 Build Runner 接口

```ts
interface BuildRunner {
  readonly kind: 'ssh'
  probe(input: RunnerProbeInput, signal: AbortSignal): Promise<RunnerCapability>
  prepare(input: RunnerInput, io: RunnerIO): Promise<PreparedWorkspace>
  build(input: RunnerInput, io: RunnerIO): Promise<BuildResult>
  buildAndPushImage(input: ImageInput, io: RunnerIO): Promise<ImageResult>
  cancel(runId: string): Promise<CancelResult>
  cleanup(runId: string): Promise<CleanupResult>
}
```

- `RunnerInput` 只包含：runId、commitSha、source bundle、projectSubdir、语言构建计划、镜像计划、超时、目标构建机配置引用。
- 秘密通过 `SecretResolver` 在 Runner 内部按需解析；`RunnerInput` 本身不携带秘密值，避免被日志/工具结果序列化。
- `RunnerIO` 提供 `log(stream, text)`、`stage(substage, status, detail)`、`signal`。
- 首个实现：`SshBuildRunner`。
- 未来适配器：`JenkinsRunner`、`DroneRunner`；在真实实现并验证前，`registry.available` 为 false，UI 显示“未实现”，不提供选择。
- Runner 不可用时，流水线校验阶段直接失败并给出原因（例如“未找到 ssh 可执行文件”），不进入假运行。

### 4.6 SSH 传输设计

**实现方式：OpenSSH 进程适配器，通过 `ctx.subprocess` 启动 `ssh/scp/ssh-keygen/ssh-keyscan`。**

- 不假设 DSH 有 SSH 服务；不依赖只有某个平台才有的系统接口。
- 本地端既支持 Windows 也支持 Linux/macOS；远端只支持 Linux。
- 不拼接不可信 shell 字符串：
  - 本地命令用 argv 数组。
  - 远端脚本以固定模板生成，动态值通过位置参数 `$1..$n` 传入，脚本内部全部加引号。
  - 脚本本身可以安全地 base64 后作为固定参数传递；密码/令牌走 stdin 或 askpass，绝不进 argv。
- 主机密钥：
  - 每个环境独立 `known_hosts`，位于插件数据目录。
  - 首次连接测试用 `ssh-keyscan` 读取指纹，UI 显示 `SHA256:...`，用户显式信任后才写入。
  - 正式连接使用 `StrictHostKeyChecking=yes`、`UserKnownHostsFile=<plugin>/known_hosts`。
  - 指纹变化直接失败，不提供“忽略一次”的默认按钮。
- 认证：
  - 私钥 + passphrase（推荐）。
  - ssh-agent。
  - 密码：通过 `SSH_ASKPASS` + 临时 askpass 脚本，`SSH_ASKPASS_REQUIRE=force`；如果当前 OpenSSH 不支持，明确提示改用密钥/agent，不静默降级。
- 超时：
  - 连接超时 `ConnectTimeout=10`。
  - 空闲保活 `ServerAliveInterval=15`、`ServerAliveCountMax=3`。
  - 构建/部署命令由上层 `AbortSignal` + 超时控制。
- 取消：
  - 先终止本地 SSH 进程及其子进程范围。
  - 再用短超时 SSH 执行 `kill -TERM -<pgid>`、必要时 `kill -KILL`，然后删除 run 目录。
  - 用独立命令验证 `test ! -e <runDir>`；验证不通过就记录 `cleanup: failed`。
- 远端脚本统一 `set -eu`，记录 `runId`、PID、工作目录；退出时清理临时目录（除非保留现场策略开启）。
- 不支持 Windows 远端构建机；检测到非 Linux 直接报错。

### 4.7 精确 Commit SHA 的源码传递

流程：

1. 本地 `git commit` 后 `git rev-parse HEAD` 得到 `sha`。
2. 推送后 `git ls-remote <remote> refs/heads/<branch>` 校验远端指向同一个 `sha`。
3. 若从已有分支/SHA 运行，先解析/获取该 `sha`，后续只用这个 `sha`。
4. 在本地创建临时 ref：`refs/heads/dsh-cicd/<runId>` 指向 `sha`。
5. `git bundle create <tmp>/<runId>.bundle refs/heads/dsh-cicd/<runId>`，这样 bundle 包含该提交及其祖先。
6. `scp` 到构建机（严格主机密钥），远端：
   ```sh
   git clone -b dsh-cicd/<runId> <bundle> <work>
   git -C <work> checkout --detach <sha>
   test "$(git -C <work> rev-parse HEAD)" = "<sha>"
   ```
7. 删除本地临时 ref、bundle 和远端临时文件。
8. 远端构建只使用这个工作目录；禁止在构建时重新 `git pull` 分支最新版本。

> 大仓库注意：bundle 会包含祖先历史，需设置大小上限并在超限时明确失败。后续可增加 `git archive` 或 shallow bundle 优化，但不能静默改变“精确 SHA”语义。

### 4.8 语言识别与构建模板

识别顺序：

1. 用户显式配置 `projectType`。
2. 用户配置 `projectSubdir`。
3. 扫描项目文件。
4. 多候选、混合语言、多模块、前后端同仓：**要求用户选择**，返回候选列表和证据，不静默选一个。

| 类型 | 识别 | 默认命令 | 产物/镜像 |
|---|---|---|---|
| Java Maven | `pom.xml` | `./mvnw -B test` / `mvn -B test`；`package` | `target/*.jar` 或 `*.war` |
| Java Gradle | `build.gradle(.kts)`、`settings.gradle` | 优先 `./gradlew build`，否则 `gradle build` | `build/libs/*.jar` |
| Node.js | `package.json` + lockfile | npm/pnpm/yarn 自动选择；`ci/install` + build + test | `dist`/`build`；区分服务端/前端 |
| Python | `pyproject.toml` / `requirements.txt` | 安装依赖 + `pytest` | 启动命令 + Python 镜像 |
| Go | `go.mod` | `go test ./...`、`go build -o ...` | 静态二进制 |
| 自定义 | 用户显式 | 用户命令 | 用户上下文/Dockerfile/产物 |

工具链：

- 默认使用隔离容器镜像，例如 `maven:3.9-eclipse-temurin-21`、`gradle:8-jdk21`、`node:22`、`python:3.12`、`golang:1.23`。
- 镜像、版本、构建/测试命令都可配置。
- 容器：`--rm`、只挂载工作目录、`--cap-drop ALL`、`no-new-privileges`、CPU/内存/PID 限制；不挂 Docker socket。
- 构建机只要求 Git、容器引擎、Buildx/BuildKit；不要求安装所有语言编译器。

### 4.9 镜像与部署

**镜像**

- 配置：registry、namespace、repository、tag 模板、context、Dockerfile 路径、build backend。
- 优先使用仓库已有 Dockerfile；没有则按语言生成可预览、可编辑的模板。
- 默认 tag：`<version>-<sha7>`；没有版本时 `sha-<sha7>`。禁止只用 `latest`。
- 记录完整引用 `<registry>/<namespace>/<repo>:<tag>` 和 digest。
- 私有仓库认证：远端 `docker login --password-stdin`，使用临时 `DOCKER_CONFIG` 目录，结束后清理。密码不写命令行、不写日志。
- Buildx：`docker buildx build --push --metadata-file ...`；从 metadata 解析 digest，并用 `imagetools inspect` 复核。
- 备选：明确配置的 classic `docker build` + `docker push`；只有实现并验证的后端才显示为可用。

**部署**

- 独立部署环境：名称、host、port、user、认证、主机指纹、kubeconfig 路径、context、namespace、Helm 可用性。
- 部署前检查：
  - `kubectl version --client`
  - `kubectl config current-context` 与配置一致
  - `kubectl auth can-i create deployments,services -n <ns>`
  - namespace 存在
  - `helm version`（仅 Helm 模式）
- 策略：
  - 有有效 Helm Chart：`helm upgrade --install`，image 通过 `--set-string` 传入。
  - 仓库有 Kubernetes YAML：`kubectl apply -f -`（manifest 走 stdin，不落日志）。
  - 都没有：用户选择生成基础 Deployment/Service 模板；指定应用名、命名空间、端口、副本数、Service 类型、健康检查。
  - `imagePullSecret`：优先使用已存在的 secret；可选用 stdin 创建/更新，不把密码写入公开 YAML 或日志。
- 部署前展示：目标环境、集群 context、namespace、release/workload、commit、完整镜像引用、策略、审批状态。
- 生产环境默认审批：流水线在 `deploy` 前停在 `awaiting_approval`；UI 人工批准后才继续。Agent 只能看到“等待审批”，不能批准。
- 验证：
  - `kubectl rollout status`（Deployment/StatefulSet/DaemonSet）。
  - Pod phase、重启次数、事件。
  - Deployment 实际 image 与 Pod `imageID`/digest；不一致即失败。
  - Helm release revision/status。
- 回滚：
  - 默认 `rollbackOnFailure = false`。
  - Helm 可选 `--atomic` 或失败后 `helm rollback`。
  - kubectl 可选 `kubectl rollout undo`；有数据变更风险时默认不自动回滚。
  - 回滚结果单独记录，不覆盖原始失败原因。

### 4.10 安全与秘密

- **凭据**：只通过 `ctx.credentials`。
  - GitHub PAT：ref。
  - 镜像仓库密码：ref。
  - SSH 私钥/passphrase/密码：ref 或 record；运行时解析，用完即弃。
  - 插件 DB 只存 credential id、类型、label、ref 名，不存值。
- **Git**：
  - 令牌不拼 URL、不进 argv、不写日志。
  - `GIT_ASKPASS` 临时脚本 + 环境变量；`GIT_TERMINAL_PROMPT=0`；关闭 trace/verbose。
  - 禁用仓库 hooks（`core.hooksPath` 指向空目录）和交互式提示。
- **敏感文件**：
  - 提交前扫描待提交/未跟踪文件。
  - 拒绝 `.env`、`*.pem`、`*.key`、`id_rsa*`、kubeconfig、凭据文件、私钥块、常见令牌格式。
  - 硬阻断，不提供“仍然提交”的默认按钮。
- **日志**：
  - 写入前按已知秘密值精确替换，再做正则兜底（GitHub token、Bearer、password、private key、docker auth）。
  - 所有工具结果、错误消息、UI 日志同样脱敏。
  - 秘密值不进入 React state 的全局快照，不写入 localStorage。
- **命令执行**：
  - 本地 Git/SSH 用 argv，不拼接。
  - 远端脚本用位置参数，动态值不进入脚本文本。
  - namespace/release/image 等做白名单校验。
  - 仓库构建命令是用户显式配置，属于可信配置；自定义命令要求用户勾选“我信任此项目脚本”。
- **主机密钥**：严格校验，UI 显式信任指纹；不提供全局 `StrictHostKeyChecking=no`。
- **生产审批**：服务端一次性 approval，绑定 `planHash`（commit + image + namespace + release + strategy）。任何字段变化都使旧审批失效。
- **权限**：DSH 的浏览器路由本身是 owner-only；Agent 工具不能创建 approval，不能读取秘密。Agent 与 DSH 同 UID，因此凭据文件不是对 Agent 的强隔离边界——这一点必须在文档中如实说明。

### 4.11 UI 设计

- 侧边栏“CI/CD”入口，`main` 页面，白色背景管理界面；控件沿用 DSH 的间距、字号、圆角和主题字体。
- 顶部 Tab：流水线、运行历史、环境、凭证。
- 流水线列表：项目名、仓库、分支、语言、最新 Commit、镜像标签、目标环境、最近状态、运行时间。
- 创建/编辑：分组表单（基础、源、语言、Runner、镜像、部署、策略），支持自动识别、Dockerfile 预览、连接测试。
- 详情：六个主阶段的横向有向图；构建节点显示当前 Runner 和具体状态；点击节点打开右侧/下方详情（日志、开始/结束、耗时、退出码、错误）。
- 运行历史：commit、镜像、Runner、集群/namespace、阶段结果、验证结果、重新运行。
- 环境/凭证：独立管理；秘密输入只写不读；显示“已配置/来源/可写”，永不显示值。
- 日志：轮询增量（约 1 秒），显示 stage/substage、stream、时间；支持复制/下载脱敏日志。
- 状态：等待、运行中、成功、失败、跳过、已取消、已中断、等待审批；不能只用颜色区分，配文字/图标。
- 刷新恢复：页面通过 URL hash 恢复当前 pipeline/run；数据从 DB 恢复。
- 没有数据/没有权限/连接失败/存储不可用：显示明确空态/错误态，不显示假成功。

### 4.12 Agent 工具

工具（名称可在实现时微调，但语义固定）：

```text
cicd_list_pipelines
cicd_get_pipeline
cicd_validate_pipeline
cicd_start_run
cicd_get_run
cicd_get_run_logs
cicd_cancel_run
cicd_list_environments
```

- 全部复用 `PipelineService`；不另写执行路径。
- `start_run` 立即返回 `runId` 和阶段快照，后台执行；不长时间阻塞 Agent 会话。
- 工具输出不含秘密、私钥、令牌、密码、完整 kubeconfig。
- 生产环境触发：返回 `approval_required`，不启动 deploy；Agent 不能批准。UI 审批后继续。
- `validate` 做只读检查：Git 状态、语言识别、Dockerfile、SSH 连接、kubectl/helm 可用性；可配置超时。
- `cancel` 调用统一取消流程，返回 `cancelling` 或终态；清理失败明确返回。
- 重复触发同一 pipeline：返回已有活跃 run 或 `RUN_ALREADY_ACTIVE`，不创建并行重复运行。

---

## 5. 构建清单（按依赖顺序）

> 标记说明：S/M/L 为相对工作量，不是承诺工期。每一项的“完成”都必须有对应验证，不以代码写完为准。

### P0 — 基线与工程骨架（S）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P0-1 | 固化目标 DSH 版本与 API 清单 | `docs/COMPATIBILITY.md` | 对照 0.2.1-rc.2 文档，列出所用 API |
| P0-2 | 建立插件包骨架 | `package.json`、`tsconfig`、`build.mjs`、`cordis.patch.yml` | `pnpm build` 通过 |
| P0-3 | 建立类型检查/测试脚本 | `pnpm typecheck`、`pnpm test` | 空测试也通过 |
| P0-4 | 定义错误码、DTO、日志接口 | `src/host/util/errors.ts`、`domain/types.ts` | 单元测试 |
| P0-5 | 安全基线与威胁模型 | `docs/SECURITY.md` | 评审清单 |
| P0-6 | 确认不修改 DSH 核心 | 目录/安装说明 | `app.asar` 无写入 |

**出口条件**：插件包可构建，manifest 合法，测试框架可运行。

### P1 — 持久化、状态机与服务骨架（M）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P1-1 | SQLite schema + migration + WAL | `store/*` | 建库、重开、迁移测试 |
| P1-2 | pipeline/run/stage repository | `run-repository.ts` | CRUD/查询/分页测试 |
| P1-3 | 状态机与非法转换拒绝 | `state-machine.ts` | 全转换矩阵测试 |
| P1-4 | 启动恢复：running → interrupted | `reconcileInterrupted` | 模拟重启测试 |
| P1-5 | 并发/重复触发锁 | active run 唯一索引 | 并发触发测试 |
| P1-6 | 取消令牌/超时/清理记录 | `timeouts.ts`、`cleanup` | 取消/超时单测 |
| P1-7 | 日志追加、分页、截断 | `stage_logs` | 日志顺序/上限测试 |
| P1-8 | 脱敏器 | `redactor.ts` | 秘密值/正则/多行测试 |

**出口条件**：持久化、状态、恢复、取消、日志基础可用；刷新/重启不出现假运行。

### P2 — Git 与 GitHub 源码管理（M/L）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P2-1 | 本地仓库检查 | `git-status.ts` | 分支/remote/dirty/untracked/ahead 测试 |
| P2-2 | 变更预览 | diff/stat/文件选择 | 预览与真实 diff 一致 |
| P2-3 | 敏感文件扫描 | `sensitive-scan.ts` | 拒绝 `.env`/私钥/kubeconfig |
| P2-4 | 提交计划与 TOCTOU 校验 | `commitPlan` + status hash | 预览后改动导致提交失败 |
| P2-5 | 安全提交 | `git commit -F -`、禁用 hooks | 提交成功、无敏感文件 |
| P2-6 | GitHub 认证 | `GIT_ASKPASS` 临时脚本 | 令牌不出现在 argv/日志 |
| P2-7 | 推送与 SHA 校验 | push + `ls-remote` | 本地/裸仓库 E2E；真实 GitHub 后补 |
| P2-8 | 分支/SHA 运行 | resolve/fetch/verify | 指定 SHA 构建精确内容 |
| P2-9 | 推送失败现场保留 | 错误分类 | 失败后 commit 不丢、可重试 |

**出口条件**：本地裸仓库完整跑通；敏感文件被阻断；SHA 精确；真实 GitHub 验收待环境。

### P3 — 语言识别与构建模板（M/L）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P3-1 | 检测器框架/候选/证据 | `detector.ts` | 四语言 + 混合仓库测试 |
| P3-2 | Maven 模板 | `maven.ts` | `pom.xml` 识别；mvnw 优先 |
| P3-3 | Gradle 模板 | `gradle.ts` | `build.gradle(.kts)`；wrapper 优先 |
| P3-4 | Node 模板 | `node.ts` | npm/pnpm/yarn；服务端/前端区分 |
| P3-5 | Python 模板 | `python.ts` | pyproject/requirements；pytest |
| P3-6 | Go 模板 | `go.ts` | go test/build；二进制路径 |
| P3-7 | 自定义项目 | `custom.ts` | 必填命令/上下文校验 |
| P3-8 | 多模块/混合仓库拒绝 | 候选选择 | 不静默选错 |
| P3-9 | 工具链镜像/版本配置 | 构建计划 | 配置校验 |
| P3-10 | Dockerfile 模板 | `dockerfile-templates.ts` | 五类模板快照测试 |
| P3-11 | 示例仓库 | `examples/*` | 本地实际 build/test |

**出口条件**：四个语言示例可识别并构建/测试；混合仓库要求选择；Dockerfile 模板可预览。

### P4 — Runner 接口与 SSH Runner（L）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P4-1 | Runner 接口/registry/能力探测 | `runner/*` | 契约测试；只显示可用 Runner |
| P4-2 | OpenSSH 传输 | `ssh-transport.ts` | argv 构造、退出码、超时 |
| P4-3 | 主机密钥 | `host-key.ts` | 首次信任、指纹变化拒绝 |
| P4-4 | 认证 | key/agent/password askpass | 无令牌进 argv |
| P4-5 | 远端脚本参数化 | `remote-scripts.ts` | 注入字符不改变命令 |
| P4-6 | 精确 SHA 传输/checkout | `source-bundle.ts` | 远端 HEAD == SHA |
| P4-7 | 构建机预检 | git/docker/buildx/disk | 缺项明确失败 |
| P4-8 | 工具链容器编译/测试 | `ssh-runner.ts` | 四语言真实构建 |
| P4-9 | 镜像构建 | buildx/classic | 生成镜像与 digest |
| P4-10 | 取消/清理 | `cleanup.ts` | 远端进程停止、目录清理/失败记录 |
| P4-11 | 远端日志流 | stdio/redaction | 实时日志、无秘密 |

**出口条件**：在真实 Linux 构建机上完成“精确 SHA → 容器编译/测试 → 镜像构建”；取消和清理有证据。

### P5 — 镜像推送与镜像引用（M）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P5-1 | 镜像计划/标签 | `image-plan.ts`、`tag.ts` | 默认含 SHA；拒绝 only latest |
| P5-2 | Dockerfile 选择/生成 | 已有优先 | 四种语言模板 |
| P5-3 | 私有仓库登录 | 临时 DOCKER_CONFIG | 密码不落日志 |
| P5-4 | 推送与 digest | `push.ts` | 远端 manifest/digest |
| P5-5 | 镜像引用一致性 | deploy 输入 | 推送/部署引用相同 |
| P5-6 | 推送失败分类 | 认证/网络/权限 | 状态/错误准确 |

**出口条件**：真实镜像仓库 push 成功；记录完整引用 + digest；失败可诊断。

### P6 — SSH 部署与 Kubernetes 验证（L）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P6-1 | 部署环境 CRUD/测试 | environments | 多环境、构建/部署分离 |
| P6-2 | kubectl/context/namespace 预检 | `kubernetes-service.ts` | 错误 context/ns 拒绝 |
| P6-3 | Helm 检测/部署 | `helm.ts` | `helm upgrade --install` |
| P6-4 | kubectl YAML 部署 | `kubectl.ts` | `apply -f -` |
| P6-5 | 基础模板生成 | `manifest-template.ts` | Deployment/Service/探针 |
| P6-6 | imagePullSecret | 现有/创建 | 不写公开 YAML/日志 |
| P6-7 | 部署前预览与审批 | `approval-service.ts` | 生产必须审批；planHash 绑定 |
| P6-8 | rollout/Pod/镜像验证 | `rollout.ts` | 实际镜像 == 期望 |
| P6-9 | 回滚策略 | `rollback.ts` | 默认关闭；显式开启才回滚 |
| P6-10 | 部署失败停止后续 | 状态机 | 验证阶段 skipped |

**出口条件**：真实集群完成 Helm 或 kubectl 部署 + rollout + 镜像核对；失败场景准确停止。

### P7 — UI（L）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P7-1 | Client 模块加载器/样式壳 | `client/index.tsx` | 能加载、slot 注册 |
| P7-2 | 侧边栏入口/主页面 | `sidebar.panellist`/`main` | 页面出现、可切换 |
| P7-3 | 流水线列表 | 表格/筛选/空态 | 真实数据、刷新恢复 |
| P7-4 | 创建/编辑 | 分组表单/校验 | 保存/回显/错误 |
| P7-5 | 详情阶段图 | `PipelineGraph.tsx` | 六节点、状态、点击 |
| P7-6 | 阶段详情/日志 | `StageDetail.tsx` | 时间/耗时/退出码/日志 |
| P7-7 | 环境/凭证 | 表单/测试/掩码 | 秘密不回显 |
| P7-8 | 运行历史/重跑 | 列表/按钮 | 历史持久化 |
| P7-9 | 审批 UI | 生产确认/plan 展示 | 未批准不部署 |
| P7-10 | 响应式/可用性 | 窄屏/键盘/空态 | 基本可用性检查 |

**出口条件**：安装到 DSH 后侧边栏出现 CI/CD，页面能完成创建、运行、查看、取消；刷新/重启数据恢复。

### P8 — Agent 工具（M）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P8-1 | 工具 schema | `cicd-tools.ts` | 参数校验 |
| P8-2 | 复用 PipelineService | 无旁路 | 代码审查 + 集成测试 |
| P8-3 | 异步触发/查询/取消 | runId + 轮询 | 不阻塞会话 |
| P8-4 | 生产审批闸门 | 返回 approval_required | Agent 无法批准 |
| P8-5 | 日志/秘密脱敏 | 工具结果 | 无秘密 |
| P8-6 | 重复触发/错误码 | 结构化结果 | 测试 |

**出口条件**：Agent 能查、校验、触发、读详情、取消；生产部署无法绕过审批；结果无秘密。

### P9 — 安装、E2E 与交付文档（L）

| ID | 任务 | 产出 | 验证 |
|---|---|---|---|
| P9-1 | 构建/打包 | `dist/` + files 清单 | 安装包可读 |
| P9-2 | 安装到 desktop profile | 安装步骤/回滚 | 插件加载、页面出现 |
| P9-3 | 四语言示例 E2E | `docs/VERIFICATION.md` | 真实日志/退出码 |
| P9-4 | Git + GitHub E2E | 同上 | 真实 SHA |
| P9-5 | 镜像 + SSH + K8s E2E | 同上 | rollout/镜像 |
| P9-6 | 失败场景矩阵 | 编译/推送/SSH/发布失败 | 状态/日志准确 |
| P9-7 | 取消/超时/清理/重启 | 同上 | 有证据 |
| P9-8 | 负面安全测试 | 无凭证/坏指纹/坏 ns | 拒绝执行 |
| P9-9 | 文档 | README/INSTALL/CONFIG/SECURITY | 可复现 |
| P9-10 | 已知限制 | `docs/LIMITATIONS.md` | 与实现一致 |

**出口条件**：验收矩阵中可执行项全部有结果；不可执行项明确标注环境阻塞，不伪造。

---

## 6. 验收场景矩阵

| # | 验收要求 | 验证方式 | 当前状态 |
|---|---|---|---|
| 1 | 规范构建、类型检查、测试、加载 Web UI | `pnpm build/typecheck/test`；安装后看侧边栏/页面 | 待实现；构建/测试可先完成，UI 加载需安装 |
| 2 | 选择仓库、预览、提交、推送、记录 SHA | 本地裸仓库 E2E；真实 GitHub（需 repo/token） | 本地可做；真实 GitHub 阻塞 |
| 3 | Maven/Node/Python/Go 各一示例构建测试 | `examples/*` + 真实执行 | Node/Python/Go 本机可做；Maven 缺 JDK/Maven 或容器 |
| 4 | 提交 → 镜像 → 推送 → SSH → K8s → rollout | 真实构建机 + registry + cluster | 阻塞：无 Docker daemon/Helm/cluster/SSH 主机 |
| 5 | 编译/推送/SSH/发布失败准确停止 | 故障注入 E2E | 可在环境就绪后做；单测先覆盖 |
| 6 | 日志/历史/凭证/状态持久化，刷新/重启不复假运行 | 重启测试 + 页面刷新 | 可实现并验证 |
| 7 | 无凭证/无权限/坏主机密钥/坏 namespace/非法配置拒绝 | 负面测试 | 可实现并验证 |
| 8 | 停止、重复触发、超时、远端清理 | 真实远端 + 故障注入 | 需真实 SSH 主机 |
| 9 | 部署镜像对应记录 SHA，非浮动 | 检查 image tag/digest 与 SHA 绑定 | 设计保证；需真实环境签字 |
| 10 | 源码/配置/安装/前置/测试/限制 | 文档评审 | 随实现交付 |

---

## 7. 测试策略

### 7.1 单元测试

- 状态机：所有合法/非法转换、终态不可变、上游失败的 skipped 传播。
- 持久化：建库/迁移/重启恢复/并发唯一索引/日志顺序与截断。
- Git：porcelain 解析、diff、敏感文件、askpass 参数、SHA 校验、推送失败分类。
- 语言：四语言与混合仓库、wrapper 优先级、产物路径、命令生成。
- 镜像：标签模板、拒绝 only latest、Dockerfile 模板快照。
- 部署：manifest 生成、namespace/release 校验、rollout 解析、镜像一致性。
- 安全：脱敏、秘密值不进 DTO、主机密钥指纹、命令注入字符。
- 工具：schema 校验、生产审批、重复触发、输出上限。

### 7.2 集成测试（无外部基础设施）

- 本地 bare Git remote：init → commit → push → `ls-remote` → 精确 SHA。
- 本地 SQLite：写入 → 关闭 → 重开 → 恢复；模拟 `running` → `interrupted`。
- Fake Runner/Transport：验证编排、失败停止、取消、清理记录；**明确标记为 fake，不作为真实构建证据**。
- Client slot smoke：在 Node 中用伪 `window.__ModuleLoader__` 加载 bundle，检查 `inject/apply` 和 slot 注册；不做视觉成功声明。

### 7.3 真实 E2E（需要环境）

- 四个示例项目：真实编译/测试，保留日志与退出码。
- 本地裸仓库/真实 GitHub：真实 commit/push/SHA。
- Linux 构建机：真实 SSH、主机指纹、精确 checkout、容器构建、取消/清理。
- Registry：真实 push、digest、私有认证。
- Kubernetes：Helm/kubectl、rollout、Pod 镜像、失败/回滚。
- 故障注入：编译失败、registry 拒绝、SSH 错误、坏 namespace、rollout 超时。

### 7.4 测试证据

每个 E2E 保留：

- 命令/目标（脱敏）
- commit SHA、镜像引用、digest
- 开始/结束/耗时/退出码
- 关键日志（脱敏）
- 远端清理结果
- 若失败，失败阶段和后续 skipped 状态

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| DSH 版本/API 变化 | 插件无法加载 | 锁定 0.2.1-rc.2；所有 API 先核对再实现；不修改核心 |
| 无 DSH SSH 服务 | 远程执行不可用 | OpenSSH 适配器；能力探测；缺失时明确不可用 |
| Windows 本地/Linux 远端差异 | 路径/命令/编码错误 | 本地 argv；远端 POSIX 脚本；单独路径校验；E2E |
| 令牌泄漏 | 严重安全事件 | 不进 URL/argv/日志；askpass；脱敏；测试扫描 |
| 恶意仓库脚本 | 构建机被入侵 | 容器隔离、最小挂载、非 root、无 Docker socket；文档说明边界 |
| 主机密钥被忽略 | 中间人 | 强制 pin；无默认跳过；测试指纹变化 |
| 远端清理不彻底 | 残留进程/目录 | 独立清理命令 + 验证 + 明确失败记录 |
| Docker/Helm/K8s 环境缺失 | 无法 E2E | 先完成代码/契约测试；环境就绪后签字；不伪造 |
| 大仓库 bundle 过大 | 构建失败/超时 | 大小上限、明确失败；后续 shallow/archive 优化 |
| 日志泄密 | 凭证泄漏 | 写前脱敏；工具结果脱敏；测试 |
| 生产误部署 | 业务事故 | 默认审批；planHash 绑定；Agent 不能批准 |
| UI 视觉未验证 | 交付不完整 | 安装后用真实页面检查；无浏览器控制时如实说明 |
| 自动回滚误伤数据 | 数据事故 | 默认关闭；明确配置；文档警告 |

---

## 9. 当前环境缺口与需要提供的信息

### 9.1 已确认可用

- DSH 0.2.1-rc.2、desktop profile。
- Windows + OpenSSH 客户端 + Git + Node + Python + Go + pnpm。
- kubectl 客户端（无 context）。

### 9.2 当前阻塞真实 E2E 的条件

| 条件 | 现状 | 需要 |
|---|---|---|
| Docker daemon | 未运行 | 启动 Docker Desktop，或提供远端构建机 |
| Helm | 未安装 | 部署机安装 Helm，或改用 kubectl |
| Kubernetes cluster | 无 context | 提供 kubeconfig/context/namespace，或本地 kind/k3d |
| Linux SSH 构建机 | 未提供 | host/port/user/认证方式；Docker/Buildx/Git |
| 镜像仓库 | 未提供 | registry/namespace/repo + 只读测试凭据 |
| GitHub 仓库 | 工作区无 remote | repo URL、分支、PAT/SSH；不要在对话中贴令牌 |
| Java/Maven/Gradle | 本机未安装 | 启动 Docker 用工具链镜像，或安装 JDK/Maven |
| SSH 服务端 | 本机未安装 | 本地 E2E 时可安装 OpenSSH Server，或用远端主机 |

### 9.3 需要你确认的产品决策

1. **状态存储**：同意使用 SQLite（推荐），还是必须使用 DSH `ctx.storageDomain`？  
   推荐 SQLite：日志/分页/状态查询更合适，且不把秘密写入 DB。
2. **首个版本的 GitHub 认证**：PAT（推荐，易测试）还是仅 SSH key/agent？
3. **生产审批**：是否接受“构建/推送完成后停在 deploy 前，由 UI 人工批准”的流程？
4. **回滚**：首版是否只做 Helm 回滚 + kubectl 显式 `rollout undo`，默认关闭？
5. **UI 范围**：是否接受页面内 Tab + URL hash 的单页管理界面（不新增 DSH 顶层路由）？
6. **真实 E2E 环境**：是否由你提供构建机/registry/K8s/GitHub，还是先在本机搭 Docker + kind + 本地 registry 做替代验证？

> 不要在对话中发送密码、私钥或 PAT。需要时在插件的“凭证”页面填写，或通过 DSH 的凭据机制配置。

---

## 10. 建议执行顺序

```text
第 1 步：P0 + P1 + P7-1/2（可加载的空壳页面 + 持久化 + 状态机）
第 2 步：P2 + P3（Git 本地闭环 + 四语言识别/构建模板 + 示例）
第 3 步：P4（SSH Runner + 精确 SHA + 容器构建 + 取消/清理）
第 4 步：P5 + P6（镜像推送 + K8s 部署/验证/审批）
第 5 步：P7 完整 UI + P8 Agent 工具
第 6 步：P9 安装/E2E/文档，逐项对照验收矩阵
```

**第一条可演示闭环**：本地 Git → 本地裸仓库 → SSH Runner 到 Linux → 编译/测试 → 镜像构建 → 推送 → SSH 部署 → rollout。  
**第一条真实闭环**：同一路径，但 GitHub/registry/K8s 换成真实环境，并在报告中记录 commit、镜像 digest、集群上下文和全部阶段结果。

---

## 11. 交付物清单

- `dsh-plugin-cicd` 完整源码（Host + Client + 测试 + 示例）。
- `README.md`：能力、安装、使用、截图/页面说明。
- `docs/INSTALL.md`：DSH 安装、profile、重启、卸载/回滚。
- `docs/CONFIGURATION.md`：所有配置字段、示例、默认值。
- `docs/SECURITY.md`：凭证、审批、主机密钥、日志脱敏、威胁边界。
- `docs/VERIFICATION.md`：逐条验收结果、真实日志、失败场景。
- `docs/LIMITATIONS.md`：未实现/未验证/环境阻塞。
- `examples/`：Maven、Node、Python、Go（以及 Gradle/混合仓库测试夹具）。
- 测试报告：单元、集成、E2E 的命令与结果。

---

## 12. 完成定义（Definition of Done）

只有同时满足以下条件，才把项目标记为“完成”：

1. `pnpm build`、`pnpm typecheck`、`pnpm test` 全部通过。
2. 插件安装到 desktop profile，DSH 重启后侧边栏出现 CI/CD，页面无崩溃。
3. 至少一条真实链路完成：GitHub 精确 SHA → SSH 构建机 → 语言构建/测试 → 镜像 push → SSH 部署 → Kubernetes rollout 验证。
4. 至少四个语言示例真实构建/测试通过（Maven、Node、Python、Go）。
5. 失败、取消、超时、重启恢复、重复触发、无权限/坏指纹/坏 namespace 均有测试结果。
6. 日志、历史、状态持久化，刷新/重启后无虚假运行状态。
7. 生产部署必须经过人工审批，Agent 无法绕过。
8. 所有秘密不出现在配置、日志、工具结果、会话内容和镜像 YAML 中。
9. 文档完整，且“未实现/未验证/环境阻塞”写得清清楚楚。

---

## 附录 A：当前环境检查命令（可复现）

```powershell
# DSH 版本
(Get-Item 'D:\DSH\DeepSeek Harness.exe').VersionInfo | Select-Object ProductVersion,FileVersion

# 宿主 Node / SQLite
$env:ELECTRON_RUN_AS_NODE=1
& 'D:\DSH\DeepSeek Harness.exe' -e "console.log(process.versions.node); console.log(!!require('node:sqlite').DatabaseSync)"

# 工具链
git --version
ssh -V
docker version
kubectl version --client
helm version
java -version
mvn -v
go version
python --version
node --version
pnpm --version

# Kubernetes
kubectl config current-context
kubectl config get-contexts
```

当前结果摘要见第 2.1 节。
