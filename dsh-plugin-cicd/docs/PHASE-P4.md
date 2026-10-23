# P4：SSH Runner 基础（进行中）

## 已完成

### Runner 契约

```text
BuildRunner
  capability()
  preflight()
  build()
  cleanup()
```

`SshBuildRunner` 是第一个实现；没有把 Jenkins/Drone 等未实现 Runner 显示为可用。

### OpenSSH 传输

- 只用 `ssh` argv，不经过本地 shell 拼接；
- `StrictHostKeyChecking=yes` + `UserKnownHostsFile`；
- `BatchMode=yes`（key/agent）；
- key auth：`-i <path>` + `IdentitiesOnly=yes`；
- agent auth；
- password：临时 `SSH_ASKPASS`，密码只通过环境变量传入，不进入 argv/日志；
- UI 支持 **用户名 + 密码**：密码保存到 `DSH_CICD_SSH_PASSWORD`，预检只传 credential ref；
- 连接超时、ServerAlive、`RequestTTY=no`；
- 远端脚本通过 stdin 传入，动态参数全部 base64 编码。

### 主机密钥

- `ssh-keyscan` 首次获取；
- `ssh-keygen -lf` 计算 SHA256 指纹；
- 可选 `expectedFingerprint` 固定校验；
- 指纹变化返回 `SSH_HOST_KEY_MISMATCH`；
- 写入 known_hosts 文件。

### 远端预检

检查：

```text
git
docker
docker buildx
/tmp 可用磁盘
```

返回逐项 `ok/detail`，不把缺失工具当成通过。

### 精确 SHA bundle

- 本地临时 ref：`refs/dsh-cicd/source/<sha>`；
- `git bundle create` 只包含该 commit；
- `git bundle verify`；
- 删除临时 ref 和临时文件；
- 已验证 bundle 内容与 commit 可用。

### 构建机预检 UI

`环境` Tab 的构建机卡片：

- host / port / user / auth；
- key path、known_hosts、期望指纹；
- 远端工作目录；
- 测试连接/工具链；
- 结果逐项展示；
- 明确提示“预检不保存配置、不执行构建”。

### API

```text
GET  /api/cicd/runners
POST /api/cicd/runner/preflight
```

### 远端构建链（代码完成，未在真实主机执行）

`SshBuildRunner.build()` 现在：

1. 本地 `git bundle` 锁定精确 SHA；
2. `scp` 上传 bundle；
3. 远端 clone + `git checkout --detach <sha>` + HEAD 校验；
4. 生成 Dockerfile 时上传到工作目录；
5. 在工具链容器里执行 install/build/test；
6. `docker build` 构建镜像；
7. `docker image inspect` 解析镜像 ID；
8. finally 清理远端工作目录和 bundle。

## API

```text
GET  /api/cicd/runners
GET  /api/cicd/runner/profile
POST /api/cicd/runner/profile
POST /api/cicd/runner/preflight
GET  /api/cicd/credentials/ssh
POST /api/cicd/credentials/ssh
```

## 尚未完成 / 未验证

| 项 | 状态 |
|---|---|---|
| source bundle 传输到远端 | 通过（真实主机） |
| 远端 checkout 精确 SHA + HEAD 校验 | 通过（真实主机） |
| 工具链容器 build/test | 通过（真实主机） |
| 镜像构建 | 通过（真实主机） |
| 远端取消/清理执行 | 通过（真实主机）：取消 running run，阶段 cancelled，清理再次尝试 |
| 远端日志实时流 | 通过（真实主机）：运行中已落库远端输出 |
| 真实 Linux SSH 主机 E2E | 通过：`deploy@build.example.com`，image `dsh-cicd/live-test:sha-83e6a88` |
| Runner 与 PipelineService 的 run 执行链 | 通过：source/build/image succeeded，push/deploy/verify skipped |

## 验证

```text
Test Files  20 passed (20)
Tests       79 passed (79)
Host routes 24
```

新增测试：

- `ssh-transport.test.ts`：argv、known_hosts、key/password askpass、主机密钥固定、scp、参数编码、清理范围。
- `source-bundle.test.ts`：真实本地 Git commit → bundle → verify → 删除临时 ref；缺失 commit 拒绝。
- `runner-preflight.test.ts`：buildx 缺失不再误判通过。
- `execution.test.ts`：无 runner profile 时 run 会失败，不会停在 queued。
- `service.test.ts`：startRun 会把 queued run 交给 starter。

## 安全边界

- 密码不进入 argv；askpass 脚本不包含密码。
- host key 默认严格校验；首次信任必须写入 known_hosts。
- 远端工作目录清理限制在配置的 workspaceRoot 下，拒绝根目录和 `..`。
- 动态参数 base64 编码，避免远端 shell 注入。
- 主机配置保存到 SQLite；密码保存到 DSH credentials。

## 下一步

1. 把 bundle 传到远端并 clone/checkout。
2. 在工具链容器中执行 install/build/test。
3. `docker build` 生成镜像并记录 ID。
4. 接取消/清理/日志。
5. 用真实 Linux SSH 主机做 E2E。
