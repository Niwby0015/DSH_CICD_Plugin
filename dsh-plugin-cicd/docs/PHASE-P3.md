# P3：语言检测与构建计划

## 范围

P3 完成“把仓库变成可审阅的构建计划”，不执行 SSH/容器：

- Maven / Gradle / Node / Python / Go 检测。
- 自定义项目必须提供构建或测试命令。
- 候选、证据、置信度、警告。
- 混合仓库拒绝静默选择。
- 工具链镜像/version 默认值，可按项目覆盖。
- install/build/test 命令计划。
- Dockerfile 模板预览，已有 Dockerfile 优先。
- 构建配置随流水线持久化。
- 流水线编辑页的“检测语言 / 预览构建计划”UI。

## 检测规则

| 语言 | 标记 | 工具选择 |
|---|---|---|
| Java / Maven | `pom.xml` | `mvnw` 优先，否则 `mvn` |
| Java / Gradle | `build.gradle` / `build.gradle.kts` | `gradlew` 优先，否则 `gradle` |
| Node | `package.json` | `packageManager` / lockfile → pnpm / yarn / npm |
| Python | `pyproject.toml` / `requirements.txt` / `setup.py` / `pytest.ini` | pytest 检测，否则 unittest |
| Go | `go.mod` | `cmd/<name>` 单入口，否则 `.` |

规则：

- 同一根目录出现多个语言族 → `BUILD_LANGUAGE_AMBIGUOUS`，必须手动选择。
- 显式指定语言但缺少对应 marker → `BUILD_MARKER_MISSING`。
- 没有 marker → 只能选 custom，并填 build/test 命令。
- Maven 多模块从 reactor root 构建；Node workspace 从根构建。
- 没有 Node `build`/`test` script、没有 Python 依赖文件时明确警告，不伪造命令。

## 构建计划

计划包含：

```text
language / tool / version / toolchainImage
workingDir
installCommand / buildCommand / testCommand
dockerfilePath / dockerfileSource / dockerfile
warnings / evidence
```

默认镜像：

```text
java-maven      maven:3.9-eclipse-temurin-21
java-gradle     gradle:8.10-jdk21
node            node:22-bookworm-slim
python          python:3.12-slim
go              golang:1.23-bookworm
custom          debian:bookworm-slim
```

Dockerfile 模板：

- 多阶段构建；构建阶段使用工具链镜像；
- Node/Python 运行时复制 `/src`；
- Java 复制 `target/*.jar` 或 `build/libs/*.jar`；
- Go 复制 `/out/app`，运行时用 distroless nonroot；
- 明确注释“preview; review entrypoint/artifact path”；
- 已存在 `Dockerfile` 时直接返回仓库内容，标记 `dockerfileSource: repository`。

## API

```text
POST /api/cicd/build/detect
  { projectPath, projectSubdir? }
  → { candidates, requiresChoice, reason, root }

POST /api/cicd/build/plan
  { projectPath, projectSubdir?, language?, build? }
  → BuildPlan（命令、镜像、警告、Dockerfile）
```

错误码：

```text
BUILD_LANGUAGE_REQUIRED
BUILD_LANGUAGE_AMBIGUOUS
BUILD_MARKER_MISSING
BUILD_COMMAND_REQUIRED
```

## UI

流水线编辑页的 **构建** section：

- 检测语言按钮；
- 候选卡片（语言、证据、警告），点击应用；
- 工具、版本、构建目录、install/build/test、Dockerfile 路径；
- 预览构建计划；
- 显示工具链镜像、命令、警告、Dockerfile 预览；
- 构建配置随流水线保存到 `config_json`。

## 验证

```text
Test Files  14 passed (14)
Tests       58 passed (58)
Host routes 18
Client slots sidebar.panellist + main
```

新增测试：

- `language.test.ts`：Node/Maven/Gradle/Python/Go、混合仓库、缺失 marker、custom 命令、已有 Dockerfile。
- `build-routes.test.ts`：detect/plan 路由、混合仓库 400。
- `language-toolchains.test.ts`：真实运行 Node、Python、Go 示例的 test/build；工具缺失时跳过。

当前环境：

```text
Node   可用
Python 可用
Go     可用
Java   缺失
Maven  缺失
Gradle 缺失
Docker 守护进程未启动
```

因此：

- Node/Python/Go 示例真实执行通过；
- Maven/Gradle 的检测、计划、Dockerfile 由单元测试覆盖，真实编译留给 P4 工具链容器；
- 不声称 Maven/Gradle 本地构建已通过。

## 限制

- 不执行构建命令；这是 P4 Runner 的职责。
- 不保证 Dockerfile 模板的最终 entrypoint 正确；必须人工审阅。
- 不自动安装工具链，不拉取依赖。
- 只扫描指定目录顶层 marker；复杂 monorepo 用 `projectSubdir` 或显式配置。
- Python 依赖安装默认 `pip install -r requirements.txt` 或 `pip install .`，不创建虚拟环境。
- 生成 Dockerfile 不包含镜像仓库 provenance/SBOM（P5）。
