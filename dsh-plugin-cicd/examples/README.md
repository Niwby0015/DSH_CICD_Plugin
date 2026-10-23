# P3 language examples

These fixtures exercise the detector and build plans. They intentionally have no external package dependencies.

| Directory | Detected language | Local toolchain |
|---|---|---|
| `node/` | Node.js + npm | `node`, `npm` |
| `python/` | Python + requirements | `python` |
| `go/` | Go module | `go` |
| `maven/` | Java / Maven | `java`, `mvn` (may be absent) |
| `gradle/` | Java / Gradle | `java`, `gradle` (may be absent) |

Use **Pipeline editor → Build → Detect language** with the matching directory, then **Preview build plan**. The plan shows install/build/test commands, toolchain image, warnings, and a generated Dockerfile preview.

Actual local execution is covered by the unit tests for Node/Python/Go where the toolchain exists; Maven/Gradle can be planned without a local JDK and are built in the P4 toolchain container.
