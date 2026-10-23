# CI/CD sample source

## nodejs-getting-started

- Path: `samples/nodejs-getting-started`
- Upstream: `https://github.com/heroku/nodejs-getting-started`
- License: MIT
- Stack: Node.js + Express + EJS + Jest
- Why it fits: small Express app, real HTTP tests, a Dockerfile now included, and no database/external service required.

Local adaptations are documented in `samples/nodejs-getting-started/SAMPLE.md`:

- `.env` renamed to `.env.example`;
- `.env` is ignored, `.env.example` is committable;
- Dockerfile added;
- upstream Git history is not included; a new `main` repository is initialized with no commit.

## First local run

```powershell
cd <workspace>\DSH_CICD_Plugin\samples\nodejs-getting-started
npm ci
npm test
npm start
```

Then open `http://127.0.0.1:5006`.

## Use with the plugin

1. **Git 源码** → local path `<workspace>\DSH_CICD_Plugin\samples\nodejs-getting-started`.
2. Target repository: your own empty GitHub repo.
3. Configure the PAT, commit the initial source, push.
4. **流水线** → new pipeline with the same project path and repo.
5. **检测语言** should select Node; **预览构建计划** should detect `.env.example`, ignore `.env`, and use the repository `Dockerfile`.

The sample intentionally has no `build` script, so the build step is skipped; the image stage still uses the provided Dockerfile. Add a real build script if you want to exercise that stage.
