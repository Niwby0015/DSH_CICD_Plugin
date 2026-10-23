# 安装与卸载

## 前置条件

| 项目 | 要求 |
|---|---|
| DSH | `0.2.1-rc.2` |
| Node.js | `>= 24`（DSH 宿主当前为 24.21） |
| pnpm | `>= 11` |
| profile | `desktop`（当前 DSH Desktop 使用的 profile） |

## 1. 构建

```powershell
cd <workspace>\DSH_CICD_Plugin\dsh-plugin-cicd
pnpm install
pnpm check
```

`pnpm check` 会执行：

```text
tsc --noEmit
vitest run
node build.mjs
node tests/host-smoke.mjs
node tests/client-smoke.mjs
```

构建产物：

```text
dist/host/index.js    Host 插件（ESM）
dist/client.js        Web Client（DSH __ModuleLoader__ 格式）
```

## 2. 安装到当前 desktop profile

当前 DSH Desktop 的 CLI 入口：

```text
<DSH_HOME>\resources\runtime\cli\bin\dsh.cmd
```

执行：

```powershell
& '<DSH_HOME>\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add "link:<workspace>\DSH_CICD_Plugin\dsh-plugin-cicd"
```

这会：

1. 在 profile 的 `package.json` 里添加一个 `link:` 依赖；
2. 把 `dsh-plugin-cicd` 加入 `dsh.profile.bundles`；
3. 让运行中的 DSH 通过 profile HMR 重新组合插件树。

> 日常更新不需要重新执行 `add`。修改源码后运行 `pnpm build`，然后刷新 DSH 页面；Host HMR 会收到 bundle 时间戳变化，Client 会按 HMR 协议替换模块。

## 3. 验证加载

1. 刷新 DSH 页面（或重启 DSH）。
2. 侧边栏出现 **CI/CD 流水线**。
3. 点击后看到白色管理界面。
4. 页面顶部不再显示“执行器尚未接入”。
5. 创建一个测试流水线，刷新页面，配置仍然存在。

插件数据默认写到：

```text
C:\Users\<user>\.dsh\cicd\cicd.db
```

如果数据库已创建，Host 插件至少已经成功激活过一次。

## 4. 安装失败排查

### 侧边栏没有入口

检查 profile：

```powershell
Get-Content 'C:\Users\<user>\.dsh\profiles\desktop\package.json'
```

应同时包含：

```json
"dsh-plugin-cicd": "link:<workspace>/DSH_CICD_Plugin/dsh-plugin-cicd"
```

以及：

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "dsh-plugin-cicd"
]
```

如果依赖存在但 bundle 不在列表里，打开 DSH 的 **插件** 页面，找到 `dsh-plugin-cicd` 并启用。

### 页面出现但 API 401

这是正常的未认证请求。页面的 `api/cicd/*` 路由通过 DSH 的 `ctx.connection.fetch` 注册，必须由已登录的 Web 页面携带同源 Cookie 访问。不要在浏览器无 Cookie 的情况下直接打开 API。

### 页面出现但 API 404

确认 Host 插件已激活：

- 查看 `~/.dsh/cicd/cicd.db` 是否存在；
- 在 DSH 日志里搜索 `dsh-cicd`；
- 确认 `dist/host/index.js` 存在且不是空文件；
- 重新运行 `pnpm build` 后刷新/重启。

### 页面白屏或 slot 崩溃

运行：

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:client
```

`smoke:client` 会用 DSH 的 `__ModuleLoader__` 契约加载 `dist/client.js`，验证 `apply` 与两个 slot 注册。如果它通过但页面仍白屏，检查浏览器 DevTools 的 `slot entry crashed` 信息，并把错误贴到问题记录中。

## 5. 卸载

优先使用 DSH **插件** 页面关闭并卸载 `dsh-plugin-cicd`。

CLI 备用：

```powershell
& 'D:\DSH\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop remove dsh-plugin-cicd
```

然后从 profile 的 `dsh.profile.bundles` 中移除 `dsh-plugin-cicd`（如果仍存在），刷新/重启 DSH。

卸载不会自动删除 `~/.dsh/cicd/cicd.db`，这是有意的：保留历史配置便于恢复。需要彻底清理时手动删除该目录。

## 6. 当前 profile 保护

本次安装过程中，CLI 的 pnpm 操作曾移除原有 `dsh-plugin-sandbox-observability` 依赖。已通过备份恢复该依赖，并重新执行 `dsh plugin install` 验证。后续如果再次安装/升级，建议：

1. 先备份：
   ```powershell
   Copy-Item '<DSH_HOME>\.dsh\profiles\desktop\package.json' 'package.json.bak'
   Copy-Item '<DSH_HOME>\.dsh\profiles\desktop\pnpm-lock.yaml' 'pnpm-lock.yaml.bak'
   ```
2. 安装后检查两个 link 依赖和 `dsh.profile.bundles`。
3. 不要把个人 profile 的备份提交进插件仓库。
