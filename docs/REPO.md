# Repository Operations

## GitHub features (MS2K_Interface parity + Projects)

| Feature | Setup |
|---|---|
| Issues | Templates: `bug_report.md`, `feature_request.md`, `config.yml` (wiki + discussions links) |
| Labels | Default set + `dependencies` |
| Milestones | M0–M5 + `Backlog` |
| Workflows | **CI** (lint · typecheck · test · build), **Deploy to GitHub Pages** (push to `main` / manual), **TODO to Issue**, **Dependabot** (npm + actions, targets `v2` until the M5 merge) |
| CodeQL | Default setup, enabled |
| Discussions / Wiki | Enabled (wiki gets the user manual at M5) |
| Pages | Enabled, Actions build → https://louissilvestri.github.io/web-synth/ |
| **Projects v2** | [Board](https://github.com/users/louissilvestri/projects/1): Backlog / Todo / In Progress / In Review / Done; every issue tracked |
| Releases | Pre-releases per milestone possible; `v2.0.0` at M5 |

## Branch strategy

`main` = v1 until the M5 merge (tag `v1.0`). All v2 work lands on the **`v2`** branch via
feature-branch PRs (`m1-engine`, `m2-control-surface`, …). CI runs on pushes/PRs to both.

## CI hard-won notes

- **Node/npm lockstep**: CI runs Node 24 because this machine's npm 11 writes the lockfile;
  npm 10 rejects its optional-dep tree. Keep `ci.yml`/`deploy.yml` `node-version` matched to
  the npm major used locally.
- **Lockfile recipe after any dependency change**: delete `package-lock.json` **and**
  `node_modules`, run a full `npm install`, then validate with a **real `npm ci`** —
  `--package-lock-only` writes locks that even the same npm rejects, and `npm ci --dry-run`
  does not catch it.
- **Watching checks from scripts**: use `gh api .../check-runs` filtered to the specific job
  — `gh pr checks` exits non-zero on failing checks, and CodeQL check-runs linger and stall
  "all completed" conditions.

## Build tooling & skills

- `npm run dev` / `build` auto-bundle the worklet (`scripts/build-worklet.mjs`); worklet
  changes need a dev-server restart.
- Claude skills used during the build: **synth-expert** (hardware/DSP reference),
  **ui-ux-expert** + design vault (M2 styling), **usability-auditor** (M4 flows),
  **dataviz** (meters), **web-scraping** (manual verification), **code-review / verify**
  (per-PR gates), Context7 MCP (library docs).
