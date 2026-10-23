# P0/P1 实现与验证

## 范围

本次完成：

- P0：工程骨架、TypeScript/esbuild/Vitest、DSH 插件清单、bundle patch、图标/locale。
- P1：SQLite 持久化、PipelineService、运行/阶段状态机、启动恢复、认证 API、日志表/脱敏器。
- UI 空壳：侧边栏入口、流水线列表、创建/编辑、详情阶段图、运行历史、环境、凭证。

本次不包含：

- Git 提交/推送。
- 语言识别与真实构建。
- SSH Runner、镜像、Kubernetes。
- Agent 工具。
- 真实 E2E。

这些都在总计划 P2–P9，不可用状态在 UI 和 API 中明确返回。

## 版本基线

| 项目 | 值 |
|---|---|
| DSH | `0.2.1-rc.2`（ProductVersion `0.2.1.0`） |
| Electron | `44.7.0` |
| 宿主 Node | `24.21.0` |
| 平台 | Windows |
| profile | `desktop` |

## 模块

```text
src/host/
  index.ts                 插件入口
  config.ts                Schemastery 全局配置
  domain/
    types.ts               非秘密 DTO
    stage-definitions.ts   六个主阶段 + report
    state-machine.ts       状态转换与聚合
    pipeline-service.ts    配置/运行/阶段服务
  routes/index.ts          认证 API 路由
  store/sqlite-store.ts    SQLite/WAL
  store/schema.ts          schema v1
  security/redactor.ts     日志/对象脱敏
  util/                    错误、ID、路径、logger
src/client/
  index.tsx                __ModuleLoader__ 客户端入口/slot
  pages/                   列表、编辑、详情、运行、环境、凭证
  components/              阶段图、阶段详情、通用控件、图标
  i18n.ts                  中英文案与阶段契约
  styles.ts                白色管理界面样式
```

## API

所有路由通过 `ctx.connection.fetch.register` 注册，路径包含 `/api`：

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/cicd/bootstrap` | 阶段定义、能力、计数、流水线、运行摘要 |
| GET | `/api/cicd/capabilities` | 能力与原因 |
| GET | `/api/cicd/pipelines` | 流水线列表 |
| POST | `/api/cicd/pipelines` | 创建/更新（body `{id?, pipeline}`） |
| GET | `/api/cicd/pipeline?id=` | 详情 + 最近运行 |
| DELETE | `/api/cicd/pipeline?id=` | 删除（有活跃运行则 409） |
| GET | `/api/cicd/runs?pipelineId=&limit=` | 运行列表 |
| GET | `/api/cicd/run?id=` | 运行 + 阶段 |
| GET | `/api/cicd/logs?id=&stage=&after=&limit=` | 日志分页 |
| POST | `/api/cicd/run/start` | 当前返回 501 `EXECUTION_NOT_READY` |

认证路由继承 DSH 的 `/api` 桥：未认证请求返回 401。测试直接调用 route 对象，不绕过认证层做生产访问。

## 数据模型

```text
pipelines(id, name, config_json, created_at, updated_at)
runs(... status, commit_sha, image_ref, config_snapshot_json, cleanup_state ...)
stages(run_id, key, ordinal, status, started_at, finished_at, exit_code, error_code, ...)
stage_logs(run_id, stage_key, seq, ts, stream, text)
events(run_id, ts, kind, payload_json)
```

- `config_snapshot_json` 为将来的历史一致性保留。
- 活跃运行唯一索引：一条流水线同时最多一个 `queued/running/awaiting_approval/cancelling` 运行。
- 启动恢复：`reconcileInterrupted()` 将活跃运行/阶段标记为 `interrupted`，并写事件。

## 状态机

阶段：

```text
pending -> running -> succeeded | failed | cancelled | interrupted
pending -> skipped | cancelled | interrupted
```

运行：

```text
queued -> running -> awaiting_approval -> running -> succeeded
                  -> failed | cancelling -> cancelled | interrupted
```

`report` 不参与成功判定，避免把失败运行汇总成成功。

## 验证结果

### 构建/类型/测试

执行：

```powershell
cd <workspace>\DSH_CICD_Plugin\dsh-plugin-cicd
pnpm check
```

结果（2026-10-22）：

```text
Test Files  5 passed (5)
Tests       30 passed (30)
built dsh-plugin-cicd: dist/host/index.js, dist/client.js
PASS host bundle activated; routes=10; pipeline=pl_tf44z3wa1q
PASS client bundle loaded; slots: sidebar.panellist, main
```

> P2 完成后总测试数为 41；P2 的 Git 集成测试见 [`PHASE-P2.md`](PHASE-P2.md)。

覆盖：

- 状态机合法/非法转换、终态、聚合。
- SQLite 关闭/重开、运行/阶段、日志顺序、重启恢复、级联删除、活跃运行唯一约束。
- PipelineService 创建/更新/校验、草稿/就绪状态、内部排队运行、拒绝执行、删除保护。
- 认证路由 bootstrap、创建/读取、坏 JSON 400、start 501。
- 脱敏（已知秘密值、GitHub token、Bearer、私钥、对象字段）。
- Host bundle 用假 Cordis 上下文激活。
- Client bundle 用 `__ModuleLoader__` 契约加载并注册两个 slot。

### 在真实 DSH 中加载

安装后：

- `~/.dsh/cicd/cicd.db` 自动创建，`PRAGMA user_version = 1`。
- 表：`pipelines/runs/stages/stage_logs/events`。
- DSH 侧边栏出现 **CI/CD 流水线**。
- 页面渲染成功；空态、创建表单、列表、环境页均有实际截图。
- 未认证请求 `GET /api/cicd/bootstrap` 返回 401，证明路由已注册且经过认证层。

截图（已裁掉侧边栏和个人会话内容）：

- [CI/CD 空状态](images/empty.png)

> 截图中的测试流水线随后已从 live DB 删除，避免把示例数据留在用户 profile 中。

### 未完成验证

- DSH 重启后的 live 恢复：由 store 测试覆盖，未重启当前用户会话。
- 页面刷新后当前 Tab/详情的深链恢复：P0/P1 未实现深链；数据本身从 SQLite 恢复。
- 真实 Git/SSH/Docker/Kubernetes：属于 P2–P6，当前环境也没有完整外部条件。

## 设计决策

1. **状态用 SQLite，而不是内存或会话日志。**
   流水线状态与日志是插件私有数据，不应进入模型会话；SQLite 适合日志分页和按运行查询。
2. **秘密不进入 SQLite。**
   后续通过 `ctx.credentials` 引用；当前凭证页不提供假输入框。
3. **执行不可用时拒绝，而不是排队。**
   `startRun()` 返回 501；UI 按钮禁用。避免“永远 queued”的假状态。
4. **页面用 slot + 认证 fetch，不用 iframe/裸 webServer。**
   保持 DSH 主题、认证和 SPA 生命周期一致。
5. **阶段图固定六个主阶段 + 终端报告。**
   与验收描述一一对应；构建子步骤后续放在 build 节点详情中。

## 下一步

P2：

- 本地 Git 状态/预览/敏感文件扫描。
- 安全提交、GITHUB askpass、推送、SHA 校验。
- 本地裸仓库 E2E。

P4/P6 的真实 E2E 仍需 Linux 构建机、registry、Helm/Kubernetes 和 GitHub 仓库。
