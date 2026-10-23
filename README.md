# DSH CI/CD Plugin

DeepSeek Harness 的独立 CI/CD 插件工程，包含插件源码和一个可直接构建的 Node.js 示例。

## 目录结构

```text
DSH_CICD_Plugin/
├─ dsh-plugin-cicd/                 # DSH 插件源码
│  ├─ src/host/                     # Host：SQLite、Git、构建、SSH、镜像、K8s
│  ├─ src/client/                   # Client：流水线、运行、环境、凭证 UI
│  ├─ tests/                        # 单元测试与集成测试
│  ├─ docs/                         # 分阶段说明与验收文档
│  ├─ examples/                     # 多语言构建样例
│  ├─ dist/                         # 构建产物（本地生成，不提交）
│  ├─ build.mjs                     # Host/Client 打包
│  ├─ package.json
│  └─ README.md
├─ samples/
│  └─ nodejs-getting-started/       # Node.js + Express + Jest 示例
├─ BUILD_PLAN.md                    # 开发计划
├─ README.md
└─ .gitignore
```

## 快速开始

### 插件

```powershell
cd dsh-plugin-cicd
pnpm install
pnpm build
pnpm test
```

插件通过 DSH profile 加载，`dist/` 不进入 Git。

### 示例应用

```powershell
cd samples/nodejs-getting-started
npm ci
npm test
npm start
```

访问 `http://127.0.0.1:5006`。

## 安全约定

- 不提交 `.env`、私钥、kubeconfig、数据库、日志或本地 DSH 配置；
- SSH 密码、GitHub Token、镜像仓库密码保存在 DSH credentials，不进入流水线配置；
- 示例 `.env.example` 只包含占位值；
- 文档中的主机、用户名、仓库地址使用示例占位，不包含真实凭据。

## 文档

- [插件说明](dsh-plugin-cicd/README.md)
- [验收记录](dsh-plugin-cicd/docs/ACCEPTANCE.md)
- [开发计划](BUILD_PLAN.md)
