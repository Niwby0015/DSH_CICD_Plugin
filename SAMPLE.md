# Sample source notice

- Upstream: `https://github.com/heroku/nodejs-getting-started`
- Archive downloaded: 2026-10-23
- License: MIT (see `LICENSE`)
- Purpose: local source fixture for the DSH CI/CD plugin.

Local adaptations for this CI/CD example:

- `.env` renamed to `.env.example`; it contained only the demo value `TIMES=2`.
- `Dockerfile` added for the image-build stage.
- `.gitignore` no longer hides `Dockerfile`; `.env` is explicitly ignored.
- `.git` history is not included. Initialize a new repository if needed.

The application is unchanged otherwise.
