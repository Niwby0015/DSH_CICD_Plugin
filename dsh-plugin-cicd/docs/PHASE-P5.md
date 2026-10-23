# P5：镜像推送与 digest

## 目标

P4 在构建机上生成镜像后，P5 将它推送到 registry，并拿到可部署的 digest：

```text
docker build
  → docker push
  → push 输出 digest
  → docker image inspect RepoDigests
  → digest 交叉校验
  → run.imageDigest
```

## 凭据

registry 用户名/密码保存在 DSH credentials，固定引用：

```text
DSH_CICD_REGISTRY_USERNAME
DSH_CICD_REGISTRY_PASSWORD
```

页面：**凭证 Tab → 镜像仓库**。

密码不进入：

- 流水线配置；
- Git URL；
- 日志；
- SSH argv。

## 远端认证

不在构建机执行 `docker login` 持久化登录。流程是：

1. 本地生成临时 `config.json`，内含 registry auth；
2. 目录/文件权限收紧（远端目录 0700，config 0600）；
3. `scp` 上传到配置的 workspaceRoot 下的临时目录；
4. `DOCKER_CONFIG=<temp> docker push <image>`;
5. `docker image inspect --format '{{json .RepoDigests}}'`;
6. 清理远端临时目录和本地临时文件。

## 镜像引用

```text
<imageRepository>:<imageTagTemplate>
```

例如：

```text
registry.example.com/team/order-service:sha-83e6a88
```

`imageRepository` 为空时，P4 只生成本地镜像，P5 的 push 阶段标记为 `skipped`，不会伪造推送成功。

## 失败分类

| 场景 | 错误码 |
|---|---|
| 缺少用户名/密码 | `REGISTRY_AUTH_FAILED` |
| registry 401/403 | `REGISTRY_AUTH_FAILED` / `REGISTRY_PUSH_DENIED` |
| push 网络/仓库错误 | `REGISTRY_PUSH_FAILED` |
| push 成功但 digest 无法交叉校验 | `REGISTRY_PUSH_FAILED` |
| push 输出没有 digest | `REGISTRY_DIGEST_MISSING` |

## API

```text
GET  /api/cicd/credentials/registry
POST /api/cicd/credentials/registry
```

POST body：

```json
{ "username": "...", "password": "..." }
```

清除：

```json
{ "clear": true }
```

## 测试

```text
tests/unit/image-plan.test.ts
```

覆盖：

- registry host 解析；
- tag 模板；
- image reference 校验；
- push digest 与 RepoDigests 解析。

## 网络问题

Docker Hub 的推送目标是 `registry-1.docker.io`。  
`registry-mirrors` 只加速拉取，不能代理 push。

如果构建机访问 Docker Hub 超时：

- 配置 Docker daemon 的 HTTP/HTTPS proxy 并重启 Docker；
- 或改用构建机可访问的国内 registry / 私有 registry；
- 或先用构建机上的本地 `registry:2` 验证推送链路。

临时配置会保留远端已有的 `~/.docker/config.json`（包括 proxies 配置），再合并 registry auth；但 daemon 级代理仍必须在 Docker daemon 上配置。

## 验证结果

本地 `registry:2` 在构建机 `0.0.0.0:5000` 启动并已通过真实推送：

```text
image:  localhost:5000/dsh-cicd:sha-83e6a88
digest: sha256:12041e54c5bee9d0872f0a06ff416032d834ef953259627cd4df5cba41d729ad
verified: true
catalog: dsh-cicd
tags: sha-83e6a88
```

Docker Hub 推送因构建机到 `registry-1.docker.io` 网络超时，未验收；这不是认证失败。

## 尚未验收

公共/私有远端 registry 的推送尚未验收。  
要验收 Docker Hub，需要：

1. 构建机能访问 Docker Hub，或配置 daemon 代理；
2. 在凭证 Tab 保存用户名/Personal Access Token；
3. 流水线镜像仓库填 `docker.io/<user>/<repo>`；
4. 运行流水线，确认 `push` 阶段 succeeded 且有 `sha256:` digest。
