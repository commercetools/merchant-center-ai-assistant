# Contributing

## Unsupported notice

This repository is unsupported reference code. Contributions are accepted without a support
commitment: there is no promise that a pull request is reviewed, merged or answered.

## Prerequisites

- Node.js 22
- Docker running locally (needed by `commercetools connect validate`)

## Layout

One folder per Connect application, as siblings at the repository root, described by one
`connect.yaml`. There are no npm workspaces; every folder installs its own dependencies.

## Rules

- Every source file carries the SPDX header. Check with `node scripts/spdx-check.mjs`.
- Package names are `ai-assistant-<suffix>` (for example `ai-assistant-service`).
- No `.github/workflows` and no other CI, container or infrastructure-as-code files.
- Never commit `.env*` files except `.env.example`, and keep secret-looking values empty there.
- Check the repository rules with `node scripts/check-repo-rules.mjs`.

## Before opening a PR

- [ ] `node scripts/spdx-check.mjs`
- [ ] `node scripts/check-repo-rules.mjs`
