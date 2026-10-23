# P2：Git 源码闭环

## 范围

本次完成：

- 本地 Git 仓库识别：root、branch、upstream、HEAD、ahead/behind。
- 工作区状态：modified / added / deleted / renamed / untracked。
- 变更 diff 预览与文件选择。
- 敏感文件/敏感内容扫描：
  - `.env`、`.env.*`（示例文件除外）
  - `*.pem`、`*.key`、`id_rsa*`、`kubeconfig`、`.npmrc`、`.pypirc`、`.netrc`
  - 私钥块、GitHub token、AWS access key、Bearer token
- 提交计划（plan）与 TOCTOU 校验：
  - 预览时计算工作区快照
  - 确认时重新扫描/计算，工作区变化则拒绝
  - 计划 10 分钟过期
- 安全提交：
  - 只 stage 用户选择的文件
  - `git commit -F -` 通过 stdin 传提交信息
  - `--no-verify` + 临时空 `core.hooksPath`，避免仓库 hooks 执行
  - 提交后解析精确 40 位 SHA
- 推送：
  - `origin` + 用户选择的远端分支
  - GitHub Token 通过 DSH `ctx.credentials` 保存
  - 临时 `GIT_ASKPASS` 脚本读取环境变量，不进入 URL/argv/日志
  - 推送后 `git ls-remote` 验证远端分支 SHA
- Git 面板 UI：
  - 顶部 **Git 源码** Tab：选择 DSH 工作区或手填本地 Git 目录；
  - 目标仓库可留空使用 origin，也可填写独立推送地址；
  - 不需要先创建流水线，也支持从流水线详情带着路径/仓库进入；
  - 状态摘要、文件勾选、diff 预览；
  - 提交信息、推送分支；
  - 预览确认、提交并推送、成功后的 SHA/远端 SHA；
  - 内嵌 GitHub Token 配置。
- API 路由：
  - `/api/cicd/git/inspect`
  - `/api/cicd/git/prepare`
  - `/api/cicd/git/commit`
  - `/api/cicd/git/push`（推送失败后重试）
  - `/api/cicd/git/branches`
  - `/api/cicd/git/resolve`
  - `/api/cicd/git/workspaces`
  - `/api/cicd/credentials/github`（GET/POST）

## 关键设计

### 本地 Git 使用 DSH 子进程

生产路径使用 `ctx.subprocess`：

```text
GitService
  → ProcessRunner
     → SubprocessRunner (ctx.subprocess.resolveExecutable/spawn)
        → git.exe / git
```

测试路径使用 `LocalProcessRunner`，直接 `spawn` 同一个 Git argv。两者都：

- 使用 argv 数组，不经过 shell 拼接；
- 有超时/取消；
- stdin 只用于明确的输入（commit message）；
- stdout/stderr 有上限。

### 认证

固定引用：

```text
DSH_CICD_GITHUB_TOKEN
```

- 通过 `ctx.credentials.set/unset/describe/resolve` 管理。
- UI 只显示“已配置/未配置”，不返回值。
- 只在 HTTPS remote 且 token 已配置时创建临时 `GIT_ASKPASS`。
- 脚本只读取 `CICD_GIT_USERNAME` / `CICD_GIT_TOKEN` 环境变量；token 不写入脚本文件。
- 操作结束删除临时目录。
- SSH remote 不注入 GitHub Token，依赖本机 ssh-agent。

### 敏感文件

- 默认选择排除敏感文件。
- 敏感文件在 UI 中禁用复选框。
- 服务端再次扫描，选中敏感文件直接拒绝（`GIT_SENSITIVE_FILE`）。
- 敏感文件的 diff 不返回给前端，避免把秘密显示在预览里。
- 已知 token/私钥内容只返回“发现类型 + 文件 + 行号”，不返回值。

### TOCTOU

```text
preview:
  status + branch + HEAD + 每个文件 diff/内容 hash
    → SHA-256 snapshot
    → plan { selectedFiles, message, pushBranch, snapshot, expiresAt }

commit:
  重新 inspect
  → 重新计算 snapshot
  → 与 plan 比较
  → 不一致：409 GIT_WORKTREE_CHANGED
```

提交计划只存在 Host 内存，DSH 重启后失效，需要重新预览；这比持久化一份可能已过期的确认更安全。

## 验证

### 自动化测试

```text
Test Files  10 passed (10)
Tests       45 passed (45)
```

新增覆盖：

- `git.test.ts`：真实本地仓库 + 真实 bare remote：
  - inspect 状态/分支/用户；
  - `.env` 被识别，默认文件不包含 `.env`；
  - 选中 `.env` 被拒绝；
  - prepare 后 diff 包含 `app.txt`、不包含 `.env`；
  - commit + push；
  - 远端 `refs/heads/main` 等于本地 commit SHA；
  - 远端提交内容正确，且不含 `.env`；
  - 工作区在 preview 后改动 → `GIT_WORKTREE_CHANGED`；
  - 本地 branch/SHA 解析、branch 列表；
  - 显式目标仓库推送时，origin 保持不变；
  - 推送失败时保留本地 commit，修复远端后可用同一 SHA 重试推送。
- `git-auth.test.ts`：askpass 脚本不含 token；清理后脚本不存在；非 HTTPS 不创建 askpass。
- `sensitive.test.ts`：敏感文件名/内容识别，返回结果不包含秘密值。
- `git-routes.test.ts`：inspect/prepare/commit 路由；Token 保存/查询/清除；响应中没有 token。
- `subprocess-runner.test.ts`：验证传给 `ctx.subprocess` 的 argv/stdin/cwd/env 形状。

### 真实执行

本地 bare remote 是真实 Git 仓库，测试实际执行了：

```text
git add
git commit
git push
git ls-remote
```

不是 mock 的“成功”结果。

### 尚未验证

- 真实 GitHub HTTPS 推送：当前没有仓库/令牌环境。
- 真实 GitHub SSH remote：依赖本机 ssh-agent。
- DSH `ctx.subprocess` 在 Desktop 中的真实 Git 调用：Host 已注入，`SubprocessRunner` 有契约测试；仍需在真实页面点击 Git 面板做一次端到端确认。
- 推送失败/认证失败的真实远端场景：本地 bare remote 不产生这些错误，代码路径已实现但未在真实 GitHub 上触发。

## 当前限制

- 只使用 `origin`，不自动改 remote。
- 不支持 force push；推送被拒时保留本地 commit，并显示错误。
- 整文件选择，不支持 hunk 级暂存。
- 预览计划 10 分钟过期，Host 重启失效。
- 提交前要求 `user.name` 和 `user.email` 已配置；不会替用户设置身份。
- 远程分支列表来自 `git ls-remote --heads`；GitHub API 的分支保护规则不在 P2 范围。
- 提交信息不做 GPG 签名。
- Git 面板的 Token 输入只用于 HTTPS；私有 SSH remote 请配置 ssh-agent。

## 下一步

P3：

- 语言识别（Maven/Gradle/Node/Python/Go/自定义）。
- 工具链容器与构建/测试命令。
- 各语言 Dockerfile 模板。
- 多模块/混合仓库强制选择。
- 示例仓库与真实本地构建。
