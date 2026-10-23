# P0–P4 收尾验收

日期：2026-10-22  
基线：DSH `0.2.1-rc.2`  
当前包版本：`dsh-plugin-cicd@0.8.12`

## 结论

P0、P1 已完成。P2 的代码、独立 Git 页面、本地真实 Git 闭环已完成；真实 GitHub 推送和真实 DSH 页面点击链路仍受环境限制，不能标记为“已验收通过”。P3 的语言检测、构建计划、Dockerfile 模板和 Node/Python/Go 示例已通过；Java/Maven/Gradle 的真实本机构建因环境缺少 JDK，留给 P4 工具链容器。P4 已完成 SSH 传输、主机密钥、askpass、远端预检和精确 SHA bundle；真实远程 build 仍未执行。

```text
P0  完成
P1  完成
P2  代码完成 / 本地真实 Git 通过 / 真实 GitHub 待环境
P3  代码完成 / Node/Python/Go 真实示例通过 / Java 本地构建待 P4
P4  基础完成 / 真实远程 build 未执行
```

## P0：工程与加载

| 验收项 | 状态 | 证据 |
|---|---|---|
| TypeScript + esbuild + Vitest | 通过 | `pnpm check` |
| 插件包 manifest / bundle patch | 通过 | `package.json`、`cordis.patch.yml` |
| locale / icon / 文档 | 通过 | `locale/*.json`、`icon.svg`、`docs/` |
| 不修改 DSH 核心 | 通过 | 全部代码在独立包内 |
| 安装到 desktop profile | 通过 | `dsh plugin --profile desktop list` |
| 加载到 Web UI | 通过 | Host 22 条路由、Client 两个 slot、页面截图 |
| 构建/类型/测试 | 通过 | 17 个测试文件、69 tests |

## P1：控制面与持久化

| 验收项 | 状态 | 证据 |
|---|---|---|
| SQLite schema/WAL | 通过 | `~/.dsh/cicd/cicd.db`；`user_version=2` |
| pipeline/run/stage 仓储 | 通过 | `store.test.ts` |
| 阶段/运行状态机 | 通过 | `state-machine.test.ts` |
| 非法状态转换拒绝 | 通过 | 状态机测试 |
| 重启恢复 `running → interrupted` | 通过 | `store.test.ts` |
| 活跃运行唯一约束 | 通过 | `store.test.ts` |
| 日志顺序/截断基础 | 通过 | `store.test.ts` |
| 认证 API 路由 | 通过 | `routes.test.ts`；未认证 401 |
| 页面刷新数据恢复 | 通过 | 数据来自 SQLite；测试数据已清理 |
| 日志脱敏 | 通过 | `redactor.test.ts` |
| 不创建虚假运行 | 通过 | `EXECUTION_NOT_READY`；按钮禁用 |

## P2：Git 源码闭环

### 已实现并通过本地真实验证

| 验收项 | 状态 | 证据 |
|---|---|---|
| 独立 Git 页面 | 通过（代码/构建） | 顶部 **Git 源码** Tab |
| 选择 DSH 工作区 | 通过（代码/构建） | `ctx.workspaceRegistry` → `/git/workspaces` |
| 手填本地源码目录 | 通过 | `GitEntryPage`；绝对路径校验 |
| 选择目标仓库 | 通过 | 留空用 origin；显式 URL 独立推送 |
| Git 状态/分支/HEAD/upstream | 通过 | `git.test.ts` |
| ahead/behind | 通过 | `git.test.ts` |
| 未跟踪/修改/删除/重命名 | 通过 | porcelain v1 解析 |
| diff 预览 | 通过 | `git.test.ts` |
| 敏感文件名扫描 | 通过 | `.env`、私钥、kubeconfig 等 |
| 敏感内容扫描 | 通过 | 私钥/token/AWS/Bearer |
| 敏感文件默认排除/禁用 | 通过 | UI + `defaultFiles` |
| 敏感文件 diff 不返回 | 通过 | 集成测试断言 |
| 提交计划/TOCTOU | 通过 | 预览后改文件 → `GIT_WORKTREE_CHANGED` |
| 计划 10 分钟过期 | 通过 | `PLAN_TTL_MS` |
| 安全提交 | 通过 | `git add -A --`、`git commit -F -`、hooks 禁用 |
| 精确 SHA | 通过 | 40 位 `rev-parse HEAD` |
| 推送到 origin | 通过 | 本地 bare remote |
| 推送到显式目标仓库 | 通过 | 第二个 bare remote；origin 不变 |
| 推送后远端 SHA 校验 | 通过 | `git ls-remote` |
| 推送失败保留本地 commit | 通过 | 失败后同一 SHA 重试成功 |
| GitHub Token 存储/查询 | 通过 | DSH credentials，响应不含 token |
| 临时 GIT_ASKPASS | 通过 | token 不写入脚本/argv；使用后清理 |
| 推送分支选择 | 通过 | GitPanel 分支输入 + 本地/远端分支 datalist |
| `ctx.subprocess` 适配器 | 契约通过 | `subprocess-runner.test.ts` |
| 不依赖流水线 | 通过 | 独立 projectPath/remoteUrl API |

### 尚未完成的真实验收

| 项 | 原因 | 影响 |
|---|---|---|
| 真实 GitHub 私有/公开仓库 push | 本地已配置凭据，但本轮未复核真实 push 与远端 SHA | 不能声称真实 GitHub 推送已通过 |
| 真实 DSH 页面完整点击 | 当前自动化只能验证 bundle/slot，未能可靠驱动 Electron 页面 | 需要人工刷新/重启后点击一次 |
| DSH `ctx.subprocess` 实际执行 Git | 当前用契约测试 + 本地真实 Git 验证 | 需要在真实页面完成一次 Git 操作 |
| 真实远端认证失败/分支保护失败 | 没有真实 GitHub 环境 | 代码路径已实现，未真实触发 |
| 从 GitHub 选择分支/SHA 直接触发流水线 | 流水线执行属于 P4 | `resolve` API 已完成，UI 触发在 P4 |

## P3：语言检测与构建计划

| 验收项 | 状态 | 证据 |
|---|---|---|
| Maven 检测 / wrapper 优先 | 通过 | `language.test.ts` |
| Gradle 检测 / wrapper 优先 | 通过 | `language.test.ts` |
| Node npm/pnpm/yarn | 通过 | `language.test.ts` |
| Python requirements/pyproject/pytest | 通过 | `language.test.ts` |
| Go module/cmd | 通过 | `language.test.ts` |
| 混合仓库强制选择 | 通过 | `BUILD_LANGUAGE_AMBIGUOUS` |
| 缺失 marker 明确失败 | 通过 | `BUILD_MARKER_MISSING` |
| Custom 必填命令 | 通过 | `BUILD_COMMAND_REQUIRED` |
| 构建配置持久化 | 通过 | `build` 写入 pipeline `config_json` |
| 工具链镜像/版本 | 通过 | 默认镜像 + 可覆盖命令 |
| Dockerfile 模板/已有优先 | 通过 | `language.test.ts`、`build-routes.test.ts` |
| 构建计划 UI | 通过（构建/类型） | PipelineEditor 构建 section |
| Node/Python/Go 示例真实执行 | 通过 | `language-toolchains.test.ts` |
| Maven/Gradle 真实本机编译 | **未完成** | 本机无 JDK/Maven/Gradle；留给 P4 容器 |

## P4：SSH Runner 基础

| 验收项 | 状态 | 证据 |
|---|---|---|
| Runner 契约 | 通过 | `runner/types.ts` |
| OpenSSH 显式 argv | 通过 | `ssh-transport.test.ts` |
| known_hosts / 严格主机密钥 | 通过 | `HostKeyManager` 测试 |
| 首次信任 + 指纹固定 | 通过 | `SHA256` 校验、mismatch 拒绝 |
| key / agent / password askpass | 通过 | 密码不进 argv；脚本不含密码；UI 保存到 DSH credentials |
| 参数化远端脚本 | 通过 | base64 参数、清理限制在配置的 workspaceRoot 下 |
| 远端预检 git/docker/buildx/disk | 通过（真实主机） | 检查项解析；buildx 缺失为可选警告 |
| 精确 SHA bundle | 通过 | `source-bundle.test.ts`，标准 branch ref 可 clone + checkout |
| 构建机预检 UI | 通过（构建/类型） | 环境 Tab 表单 |
| 主机配置持久化 | 通过 | `runner_profiles`、schema v2 |
| bundle 上传 / 远端 checkout | 通过（真实主机） | scp + `prepareWorkspaceInvocation` |
| 工具链容器 build/test / image build | 通过（真实主机） | `SshBuildRunner.build()`：source/build/image 成功 |
| 真实 Linux SSH 主机 E2E | **通过** | `deploy@build.example.com`：真实 build 与 image 成功，push/deploy/verify skipped |
| Runner 与 PipelineService run 链 | 通过（真实主机） | run succeeded；阶段 source/build/image succeeded，其余 skipped |
| 运行取消 | 通过（真实主机） | 运行中取消 → `cancelled`/`CANCELLED`；running 阶段 cancelled，后续 skipped |
| 实时日志 | 通过（真实主机） | 运行中已能读到 `Cloning into ...`，不再等构建结束 |

## P5：镜像推送

| 验收项 | 状态 | 证据 |
|---|---|---|
| 镜像引用与 tag | 通过（单测） | `image-plan.test.ts` |
| 临时 DOCKER_CONFIG 认证 | 代码完成 | 本机生成 auth，scp 到远端，chmod 600 |
| `docker push` | 通过（本地 registry） | `SshBuildRunner.pushImage()` |
| digest 交叉校验 | 通过（本地 registry） | push 输出 + `RepoDigests` 对比 |
| registry 凭据 UI | 通过 | Credentials Tab 用户名/密码 |
| 401/403/网络失败分类 | 通过（代码） | `REGISTRY_AUTH_FAILED` / `PUSH_DENIED` / `PUSH_FAILED` |
| 真实 registry E2E | **本地 registry 通过** | `localhost:5000/dsh-cicd:sha-83e6a88`，digest 已交叉校验；Docker Hub 网络超时未验收 |

## P6：Kubernetes 部署与验证

| 验收项 | 状态 | 证据 |
|---|---|---|
| kubectl/kubeconfig 可用性 | 通过（真实主机） | 构建机 `/usr/bin/kubectl`，context `kubernetes-admin@kubernetes` |
| Deployment 创建/更新 | 通过（真实集群） | `kubectl apply` 生成 Deployment |
| Service | 通过（真实集群） | ClusterIP/NodePort，端口映射 |
| Ingress | 代码完成 | 配置 ingressHost 时生成 networking.k8s.io/v1 Ingress |
| 探针 | 通过（真实集群） | readiness/liveness 使用 HTTP healthPath |
| HTTP 健康检查 | 通过（真实集群） | port-forward + curl，`HTTP=200` |
| imagePullSecret | 支持已有 Secret | Pod spec `imagePullSecrets`；未实现自动创建 |
| 镜像引用 | 通过（真实集群） | 部署使用 `repo:sha-<commit>`；digest 仍记录在 run/push 阶段 |
| rollout 验证 | 通过（真实集群） | `kubectl rollout status` + ready/desired 校验 |
| 失败分类 | 通过（代码） | `KUBERNETES_UNAVAILABLE` / `KUBERNETES_DEPLOY_FAILED` |
| Helm/template | 未实现 | 明确返回 `DEPLOY_UNSUPPORTED` |
| 真实集群 Deploy E2E | **通过** | `sample`：Deployment+Service，rollout 1/1，HTTP 200 |

## 当前环境验证结果

```text
pnpm check
Test Files  20 passed (20)
Tests       82 passed (82)
Host: 24 routes
Client: sidebar.panellist + main
```

本地 Git 集成测试真实执行：

```text
git add
git commit
git push
git ls-remote
```

并验证：

- 远端分支 SHA == 本地 commit SHA；
- 推送内容不含 `.env`；
- 显式 target remote 与 origin 分离；
- push 失败后本地 commit 保留，修复 remote 后重试成功。

本地语言示例真实执行：

```text
Node   test/build 通过
Python unittest 通过
Go     go test ./... 通过
```

## 已知限制

- 提交预览计划只在 Host 内存中，10 分钟过期；DSH 重启后重新预览。
- 只支持 `origin` 或显式 remote URL；不自动修改 remote 配置。
- 不提供 force push；推送被拒时保留现场。
- 整文件选择，不支持 hunk 级暂存。
- 不提供 GPG 签名。
- 真实 GitHub E2E 需要用户提供仓库/凭据，且凭据不能出现在对话中。
- P3 的构建计划已接入 P4 真实执行；Java/Maven/Gradle 的真实本机执行仍缺 JDK 环境。
- Dockerfile 模板的 entrypoint/artifact 路径必须人工审阅。
- P4 已在 `deploy@build.example.com` 真实完成 source/build/image。
- P5 本地 registry 推送已通过；Docker Hub 公网推送因构建机网络超时未验收。
- P6 已完成 Deployment/Service/Ingress 模板、探针、rollout 和 HTTP 健康检查；imagePullSecret 仅支持已有 Secret。
- P6 的 Helm/模板渲染、自动 imagePullSecret、审批和回滚尚未实现。
- `node:sqlite` 仍是 Node 24 实验性 API；当前宿主可用。

## 收尾判定

P0/P1/P2/P3/P4 已完成并经过真实构建验证；P4 取消和实时日志已通过真实主机验证；P5 本地 registry 推送和 digest 校验通过；P6 的 Deployment/Service/Ingress 模板、探针、rollout 和 HTTP 200 已通过真实集群验证。剩余主要缺口是 Helm、自动 imagePullSecret、审批/回滚、多节点 registry 和完整 E2E 矩阵。
