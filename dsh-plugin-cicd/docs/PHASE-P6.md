# P6：Kubernetes 部署与验证

## 目标

P5 推送镜像后，P6 在 Kubernetes 集群中更新或创建 Deployment，并验证 rollout：

```text
image tag (sha-<commit>)
  → kubectl set image / create deployment
  → kubectl rollout status
  → readyReplicas == desiredReplicas
  → verify succeeded
```

部署使用 tag，便于已预加载镜像的集群直接解析；digest 仍记录在 run 和 push 阶段。

## 前提

构建机需要：

- `kubectl`；
- `~/.kube/config`，或通过远程环境变量 `KUBECONFIG` 指定；
- 有目标 namespace 的 create/update 权限。

集群节点必须能拉取镜像，或已经预加载同名 tag。  
构建机上的 `localhost:5000` 只对构建机有效；本机测试可以把镜像导入各节点 containerd。

## 流水线字段

```text
部署策略：kubectl 或 auto
命名空间：default 或实际 namespace
发布名称：Deployment/Service 名称
容器端口：镜像实际监听端口
Service 端口：Service 暴露端口
Service 类型：ClusterIP / NodePort
副本数：1–10
健康检查路径：默认 /
Ingress 域名：可选
Ingress Class：可选
imagePullSecret：可选，必须是已存在的 Secret
```

`targetEnvironment` 当前只作为 label，不参与 kubectl 目标选择。

## 行为

生成并应用：

```bash
kubectl apply -f -
```

包含：

- Deployment；
- Service；
- 可选 Ingress；
- readiness/liveness HTTP 探针；
- 可选 imagePullSecret。

然后：

```bash
kubectl -n <ns> rollout status deployment/<name> --timeout=180s
kubectl -n <ns> get deployment <name> -o jsonpath=...
kubectl -n <ns> port-forward service/<name> 18080:<servicePort>
curl http://127.0.0.1:18080<healthPath>
```

只有 rollout ready/desired 和 HTTP 2xx/3xx 都通过，`deploy` 和 `verify` 才会标记 succeeded。

## 未实现

- Helm；
- 独立模板文件/values；
- 自动创建 imagePullSecret；
- 审批；
- 回滚；
- 多环境 target 凭据隔离。

选择 `helm` 或 `template` 时，当前会明确返回 `DEPLOY_UNSUPPORTED`，不会伪造部署成功。

## 当前集群与结果

构建机已有：

```text
kubectl v1.28+
context: <your-context>
nodes:
  control-plane   <control-plane-ip>
  worker-1        <worker-1-ip>
  worker-2        <worker-2-ip>
```

真实部署结果：

```text
run: run_tr8jpwrb49
namespace: test-ns
deployment: sample
service: sample
node: node1
image: localhost:5000/dsh-cicd:sha-83e6a88
ready: 1/1
rollout: successful
verify: kubectl rollout status + HTTP health
httpStatus: 200
```

全流程阶段结果：

```text
source  succeeded
build   succeeded
image   succeeded
push    succeeded (verified digest)
deploy  succeeded (ready 1/1)
verify  succeeded (HTTP 200)
report  succeeded
```

实现备注：阶段状态机要求先 `pending → running` 再 `running → succeeded`；verify 一度直接从 pending 跳到 succeeded 而被拒绝，已改为显式两步转移，并加了 `VERIFY_INCOMPLETE` 守卫。

镜像通过 `docker save` + `ctr -n k8s.io images import` 预加载到 node1；直接按 digest 部署会触发 containerd HTTPS 拉取错误，所以部署使用带 commit SHA 的 tag。要支持远程 registry 的 digest 固定，需要节点信任 registry 或使用 HTTPS registry。
