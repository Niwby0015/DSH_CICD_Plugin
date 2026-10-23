# dsh-plugin-cicd

DeepSeek Harness 的 CI/CD 插件：Git 提交/推送、多语言构建、SSH 远程构建、镜像推送、Kubernetes 部署与验证。

## 功能

- 流水线配置持久化、运行历史、阶段状态机；
- Git 状态检查、diff 预览、敏感文件拦截、提交与推送；
- Node.js / Python / Go / Maven / Gradle 构建计划；
- SSH 远程构建：精确 SHA bundle、远端 checkout、容器内编译测试；
- Docker 镜像构建、registry 推送、digest 校验；
- Kubernetes Deployment/Service/Ingress 部署、rollout 和 HTTP 健康检查；
- 运行取消、实时日志、日志脱敏；
- 构建与部署共用同一台 SSH 远程服务器。

## 要求

- DSH `0.2.1-rc.2` 或兼容版本；
- Node.js `>= 24`；
- pnpm `>= 11`；
- 远程构建机：Linux、Git、Docker、kubectl / kubeconfig。

## 构建

```powershell
cd <workspace>\DSH_CICD_Plugin\dsh-plugin-cicd
pnpm install
pnpm check
pnpm build
```

`pnpm check` 会执行类型检查、单元/集成测试和 Host/Client 加载冒烟测试。

## 安装到 DSH

```powershell
& '<DSH_HOME>\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add "link:<workspace>\DSH_CICD_Plugin\dsh-plugin-cicd"
```

重启 DSH 后，侧边栏出现 **CI/CD 流水线**。

## 目录

```text
src/host/       Host：SQLite、Git、构建、SSH Runner、镜像、K8s
src/client/     Client：流水线、运行、环境、凭证、Git 页面
tests/          单元测试、集成测试、加载冒烟
docs/           验收与阶段说明
examples/       多语言构建样例
```

## 安全

- SSH 密码、GitHub Token、registry 密码保存在 DSH credentials；
- 不写入流水线配置、URL、argv 或日志；
- 日志写入前脱敏；
- 不提交 `.env`、私钥、kubeconfig、数据库和日志。

## 文档

- [验收记录](docs/ACCEPTANCE.md)
- [安装说明](docs/INSTALL.md)
- [P6 Kubernetes 部署](docs/PHASE-P6.md)
