## 0. Read first

Read these in order; about 45 minutes. Do not start coding before you can answer the questions at the end.

- [ ] 0.1 Read the context documents
  - `openspec/changes/a-repo-bootstrap-labs-compliance/proposal.md` and `design.md` (especially "Explore findings" E1-E11 and "Decisions").
  - `plans/00-overview.md` (requirements R5, R6), `plans/04-workflow.md` sections 3-4 (task shape, Definition of Done), `plans/02-target-architecture.md` section 1 (repo layout).
  - The private labs publication skill: `SKILL.md`, `scripts/ossify.mjs`, `scripts/gate.mjs` (ask the maintainer for the directory; you will point `LABS_PUBLISH_DIR` at it). **Never open or copy `policy.json` into this repo.**
  - Connect repo-shape rules: commercetools-connect skill `references/monorepo-with-storefront.md` (Patterns 1-2) and `references/project-structure.md` (Pattern 3).
  - You should now be able to explain: (1) why every source file carries a header although a `LICENSE` exists, (2) which directories ossify never touches, (3) why a package named `ai-assistant-service` ends up as `@commercetools-labs/ai-assistant-service`, (4) why there is no root `package.json` with `workspaces`, (5) why `policy.json` must never be committed.

## 1. Setup

- [ ] 1.1 Verify the toolchain and the working tree
  - Run: `cd /Users/behnam/code/commercetools-labs/ai-assistant && node -v && git status --short | head -5 && openspec --version`
  - Expected: `v22.x`, a list of already-staged `plans/`, `openspec/`, `.claude/` files (nothing else; `plans/` and `openspec/` will be published after the scrub of change X, `.claude/` will not), `1.6.0` (or newer).
  - Create the branch: `git switch -c spec/a` (parallel specs use `spec/<id>` per plans/04-workflow.md section 2).
- [ ] 1.2 Point the wrapper variable at the private tooling (only needed for tasks 6.x and Verification)
  - Run: `export LABS_PUBLISH_DIR=<directory that contains ossify.mjs, gate.mjs, policy.json>` then `ls "$LABS_PUBLISH_DIR"`
  - Expected: the three files are listed. Do not add this path to any file in the repo.

## 2. Licensing and notice files

- [ ] 2.1 Create `LICENSE`
  **Why:** the gate requires it and every header points to it ("See LICENSE").
  **Where:** `LICENSE` (repo root, create).
  **How:**
  1. Run the private tool once on a throw-away empty directory to get the exact text: `mkdir -p "$TMPDIR/lic" && node "$LABS_PUBLISH_DIR/ossify.mjs" --repo "$TMPDIR/lic" --apply --year 2026 >/dev/null && cp "$TMPDIR/lic/LICENSE" ./LICENSE`
  2. Open the file and check line 3 reads `Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors`.
  **Done when:** `head -3 LICENSE` shows `MIT License`, a blank line, then the holder line above; `diff LICENSE "$TMPDIR/lic/LICENSE"` prints nothing.
  **Watch out:** do not retype the text; any difference would make `ossify --apply` in spec X modify the file. The year is replaced by X (`--year "$(date +%Y)"`), so keep `2026` only if X runs in 2026.
- [ ] 2.2 Create `README.md` with the unsupported banner
  **Why:** one of the three places where "unsupported" must appear; the reader under deadline reads exactly one.
  **Where:** `README.md` (create). Spec W will write the body later but must keep the banner.
  **How:** write this exact start, then a 5-line placeholder body (what the project is, "documentation is written in change W"):
  ```markdown
  > **UNSUPPORTED - commercetools Labs.** This repository is freely available reference code,
  > provided AS IS under the MIT license with **no support, no SLA and no roadmap commitment**.
  > See [SUPPORT.md](./SUPPORT.md) and [LICENSE](./LICENSE).

  # AI Assistant for the Merchant Center
  ```
  **Done when:** `sed -n 1,15p README.md | grep -ci unsupported` prints `1` or more.
  **Watch out:** do not use the three gate framing words anywhere (they are listed in the checker constant `FRAMING_WORDS`, task 5.4; design E5).
- [ ] 2.3 Create `SUPPORT.md`
  **Why:** gate-required file; the second "unsupported" place.
  **Where:** `SUPPORT.md` (create).
  **How:** sections: "Status: unsupported"; "What you can expect" (nothing guaranteed; issues and PRs read on a best-effort basis, may be closed without answer); "What to do instead" (fork it; commercetools product support does not cover this repository); "Security" (do not post secrets or project data in issues).
  **Done when:** `grep -ci unsupported SUPPORT.md` prints `2` or more.
  **Watch out:** no e-mail addresses of individuals, no internal channel names.
- [ ] 2.4 Create `CONTRIBUTING.md`
  **Why:** gate-required file; contributors need the header and naming rules.
  **Where:** `CONTRIBUTING.md` (create).
  **How:** sections: Unsupported notice (one paragraph, repeats "no support commitment"); Prerequisites (Node 22, Docker running for `commercetools connect validate`); Layout (one folder per Connect application, no workspaces); Rules: SPDX header in every source file (`node scripts/spdx-check.mjs`), package names `ai-assistant-<suffix>`, no `.github/workflows`, never commit `.env*` except `.env.example`, `node scripts/check-repo-rules.mjs`; "Before opening a PR" checklist with the two commands.
  **Done when:** file exists and mentions both scripts by exact path.
  **Watch out:** do not mention the private tooling or its location here; this file is published.

## 3. Ignore rules

- [ ] 3.1 Write the root `.gitignore`
  **Why:** keeps secrets, build output and agent evidence out of every commit (gate forbids `.env`, `*.pem`, `*.key`, `.npmrc`).
  **Where:** `.gitignore` (create). Merge ideas from `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/.gitignore` and `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/.gitignore`; drop the Terraform and Drive-manifest lines.
  **How:** include at least:
  ```gitignore
  node_modules/
  coverage/
  build/
  dist/
  public/
  .DS_Store
  .vscode/
  .idea/
  .env
  .env.*
  !.env.example
  *.pem
  *.key
  *.p12
  service-account*.json
  .npmrc
  *.log
  .connect/*.log
  plans/evidence/
  ```
  **Done when:** run `touch service/.env.local mc-app/.env && git status --short | grep -c '\.env'` prints `0`; then `rm service/.env.local mc-app/.env` (and remove the empty folders you created, `rmdir service mc-app` if empty).
  **Watch out:** `public/` is ignored on purpose: in the legacy MC apps it is pure build output (design E11). If a later spec needs a tracked static file, give it another folder name (never `public`, ossify skips that name).

## 4. SPDX and naming checker

- [ ] 4.1 Create `scripts/spdx-check.mjs` (core)
  **Why:** the Definition-of-Done command for headers; runs without the private tooling.
  **Where:** `scripts/spdx-check.mjs` (create; it needs its own header).
  **How:**
  1. Start the file with the 5-line SPDX block comment (see `LICENSE` holder; shebang `#!/usr/bin/env node` first).
  2. Constants copied from design E4 with a comment `// mirrors the labs gate: keep in sync`: `REQUIRED_EXT = ['.ts','.tsx','.js','.jsx','.mjs','.cjs','.mts','.cts','.java','.kt','.swift','.css','.scss','.sh']`, `GENERATED = ['package-lock.json','yarn.lock','pnpm-lock.yaml','schemas/','src/types/generated/','types/generated/','public/','dist/','build/','.next/']` (a path ending in `/` matches as substring, others as suffix), `SKIP_DIRS = ['node_modules','.git','coverage']`.
  3. File list: `execFileSync('git', ['ls-files','--cached','--others','--exclude-standard'], {encoding:'utf8'})`, split on newline, drop paths under entries of `scripts/internal-paths.json` (read it if present).
  4. For each required file read the first 600 chars; pass if it contains `SPDX-License-Identifier: MIT` and `commercetools-labs contributors` and `UNSUPPORTED`.
  5. Print one line per failure (`MISSING HEADER path`), a summary, exit 1 when any failure, else 0. Flags: `--names` (task 4.2), `--license` (task 4.3). Default (no flags) runs headers + names + license.
  **Done when:** `node scripts/spdx-check.mjs` exits 0 on the current tree (the script itself is headered); creating `service/src/x.ts` without a header makes it exit 1 and print the path (delete the file afterwards).
  **Watch out:** `.d.ts` files end in `.ts` and need headers; `.json`, `.yaml`, `.md` never do. Use `path.extname`, not a regex on the whole name.
- [ ] 4.2 Add the package-name check to `scripts/spdx-check.mjs`
  **Why:** rule "dev names are `ai-assistant[-suffix]`, ossify adds the scope".
  **Where:** same file.
  **How:** for every tracked `package.json` (via the same file list) parse JSON; if `name` is present it must match `/^(@commercetools-labs\/)?ai-assistant(-[a-z0-9]+)*$/`; also require `private: true` unless the file is in an allow-list (empty for now). Missing `name` is allowed. Print `BAD NAME path: <name> (expected ai-assistant-<suffix>)`.
  **Done when:** a temporary `service/package.json` with `"name":"service-typescript"` fails; with `"name":"ai-assistant-service"` passes (remove the temp file after).
  **Watch out:** the four deployable names are fixed by Q10: `ai-assistant-service`, `ai-assistant-mc-app`, `ai-assistant-composed-apps`, `ai-assistant-mc-view-app`; change B creates them. Do not hard-code only these four: shared helper packages may appear later.
- [ ] 4.3 Add the license check (`--license`)
  **Why:** spec requirement "LICENSE byte-identical to ossify output".
  **Where:** same file.
  **How:** read `LICENSE`; require it starts with `MIT License`, contains `Copyright (c) <4 digits> commercetools GmbH and the commercetools-labs contributors` and the phrase `THE SOFTWARE IS PROVIDED "AS IS"`; fail if any other tracked file is named `LICENSE`, `LICENCE` or `COPYING` (case-insensitive, any directory).
  **Done when:** `node scripts/spdx-check.mjs --license` exits 0; `touch service/LICENSE` (while tracked via `git add -N`) makes it exit 1. Clean up afterwards.
  **Watch out:** `connect init` writes a root `LICENSE` in the scaffold folder; if you scaffold into a subfolder, delete that file.
- [ ] 4.4 Unit-test the checker with `node:test`
  **Why:** the checker is the safety net; it needs its own net.
  **Where:** `scripts/tests/spdx-check.test.mjs` (create, with header). Refactor `spdx-check.mjs` so the logic is exported functions (`checkHeader(text)`, `checkName(json)`, `isGenerated(path)`) and the CLI part runs only when `import.meta.url === pathToFileURL(process.argv[1]).href`.
  **How:** tests named (use these exact names): `header: accepts block comment after shebang`, `header: rejects missing SPDX`, `header: rejects header without UNSUPPORTED line`, `generated: public/ and lock files are exempt`, `names: accepts scoped and unscoped`, `names: rejects foreign scope`, `names: rejects service-typescript`.
  **Done when:** `node --test scripts/tests/` reports `pass 7`, `fail 0`.
  **Watch out:** test fixtures are strings in memory; do not create files that look like secrets (design E6).

## 5. Repo rules checker

- [ ] 5.1 Create `scripts/check-repo-rules.mjs` with the file-shape rules
  **Why:** enforces "no GitHub Actions / Docker / IaC" and forbidden files.
  **Where:** `scripts/check-repo-rules.mjs` (create, headered). Reuse the git file-list helper by moving it to `scripts/lib/files.mjs` (headered) imported by both checkers.
  **How:** FAIL when any tracked-or-untracked-not-ignored path matches: `^\.github/(workflows/|dependabot\.yml|CODEOWNERS)`, `(^|/)\.gitlab-ci\.yml$`, `^\.circleci/`, `azure-pipelines\.yml$`, `cloudbuild\.ya?ml$`, `(^|/)Dockerfile`, `docker-compose`, `(^|/)netlify\.toml$`, `(^|/)vercel\.json$`, `\.tf$`, `\.tfvars$`; also forbidden-file patterns `(^|/)\.env$`, `(^|/)\.env\.local$`, `\.pem$`, `\.p12$`, `\.key$`, `(^|/)service-account.*\.json$`, `(^|/)\.npmrc$`. Message names the rule: `NO-CI`, `FORBIDDEN-FILE`.
  **Done when:** `mkdir -p .github/workflows && touch .github/workflows/x.yml && git add -N .github && node scripts/check-repo-rules.mjs; echo $?` prints a `NO-CI` line and `1`. Clean up with `git rm -rf --cached .github; rm -rf .github`.
  **Watch out:** `git ls-files --others --exclude-standard` does not list ignored files; that is intended, `.gitignore` is the first defence.
- [ ] 5.2 Add the `.env.example` value policy
  **Why:** the gate FAILs on secret-looking literals with no override (design E6).
  **Where:** same file, function `checkEnvExample(text)`.
  **How:** for each tracked file named `.env.example`: parse `KEY=value` lines (ignore comments/blank). Rule 1: if `KEY` matches `/(SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL)/` the value must be empty. Rule 2: otherwise the value must be empty or match `^(true|false|\d+|replace-me|[a-z][a-z0-9-]*|https?://(localhost|127\.0\.0\.1|[a-z0-9.-]*example\.[a-z]+)[^\s]*)$`. Print `ENV-EXAMPLE path:line KEY`.
  **Done when:** a temp `service/.env.example` with `GCP_SA_KEY_BASE64=abc` fails; with `GCP_SA_KEY_BASE64=` and `MCP_TOOLS_TTL_MS=1800000` passes.
  **Watch out:** `ENTRY_POINT_URI_PATH=ai-assistant` is fine (lowercase word); real project ids, custom application ids and URLs of deployed services are NOT (they contain digits/hyphen mixes the regex rejects; keep them in your untracked `.env`).
- [ ] 5.3 Add the notice checks (`README` banner, `SUPPORT.md`, `CONTRIBUTING.md`)
  **Why:** spec requirement "unsupported appears three times".
  **Where:** same file.
  **How:** require files `LICENSE SUPPORT.md CONTRIBUTING.md README.md` exist; `README.md` lines 1-15 match `/unsupported/i`; `SUPPORT.md` matches `/unsupported/i`; `CONTRIBUTING.md` mentions `scripts/spdx-check.mjs`.
  **Done when:** deleting the banner from README makes the check exit 1 (restore it).
  **Watch out:** the "third place" (the SPDX disclaimer line in each file) is covered by `spdx-check.mjs`.
- [ ] 5.4 Add the prose check (`--prose`, also part of the default run)
  **Why:** the gate WARN on framing words blocks publication until acknowledged; catch it early.
  **Where:** same file; internal paths come from `scripts/internal-paths.json` (task 7.1).
  **How:** for tracked text files (extensions `.md .ts .tsx .js .jsx .mjs .cjs .yaml .yml .json .sh .html .txt`) outside internal paths and outside the generated list, test each line against the case-insensitive word-boundary regex built from the exported constant `FRAMING_WORDS` (the three sales-style words the gate warns about; write them only inside the checker source, as `\b...\b` regex parts, never in prose); print `FRAMING path:line context`.
  **Done when:** adding a framing word to README fails (use a temporary edit); the same word inside `plans/` is NOT reported by `--prose` (docs mode, task 5.5, covers it).
  **Watch out:** `package-lock.json`/`yarn.lock` are exempt (generated), but dependency names inside them are not your problem.
- [ ] 5.5 Add the docs mode (`--docs`, `--docs --strict`)
  **Why:** `plans/` and `openspec/` are published as design documentation (decision Q16), so they must be linted too, but they are full of development-time text until change X scrubs them.
  **Where:** same file, function `findDocsHygiene(path, text)`; files: every tracked `.md` under `plans/` and `openspec/` that `isInternal()` does not exclude.
  **How:** per line report `DOCS-HYGIENE path:line <class>` for classes `framing` (constant `FRAMING_WORDS`), `absolute-path` (`/Users/`, `/home/<name>/`, `[A-Za-z]:\\Users`), `deployed-host` (tunnel-service and deployed-service host names, written in the checker as character-class regexes) and `internal-ref` (any entry of `scripts/internal-paths.json`; text inside fenced blocks is scanned too). Default `--docs` prints findings and the count and exits 0; `--docs --strict` exits 1 when the count is not zero. Without `--docs` the folders are not scanned.
  **Done when:** `node scripts/check-repo-rules.mjs --docs | tail -1` prints `docs hygiene: <n> finding(s) (not blocking in development)`; `node scripts/check-repo-rules.mjs --docs --strict; echo $?` prints `1` while findings exist and `0` on a scrubbed tree (change X).
  **Watch out:** many development-time findings are expected in the development tree (absolute local paths in task commands, references to the internal tooling); change X's scrub step removes them on the publication copy, which is where `--strict` must reach zero. Do not add a per-line escape hatch. Generic classes only: customer and private-repository names are the private gate's job, not this script's.
- [ ] 5.6 Unit-test the rules checker
  **Where:** `scripts/tests/check-repo-rules.test.mjs` (create, headered); export `checkEnvExample`, `matchesForbidden`, `findFraming`, `findDocsHygiene`.
  **How:** tests named: `env: secret-shaped key must be empty`, `env: accepts localhost url and integers`, `env: rejects deployed url`, `ci: workflows path rejected`, `ci: Dockerfile and netlify.toml rejected`, `framing: word boundary (a longer word containing a framing word is fine)`, `framing: the three framing words are rejected`, `docs: absolute path and deployed host reported`, `docs: strict exits non-zero only with findings`.
  **Done when:** `node --test scripts/tests/` reports `pass 16`, `fail 0`.
  **Watch out:** write test strings so they do not themselves trip the prose check: build them with concatenation (`'de' + 'mo'`) or in-memory arrays; run `node scripts/check-repo-rules.mjs` after writing the tests to prove they do not.

## 6. Wrapper for the private tooling

- [ ] 6.1 Create `scripts/labs-gate.sh`
  **Why:** one memorable command for the maintainer without copying private files.
  **Where:** `scripts/labs-gate.sh` (create, `chmod +x`).
  **How:**
  ```bash
  #!/usr/bin/env bash
  # SPDX-License-Identifier: MIT
  # Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
  # Freely available, AS IS and UNSUPPORTED. See LICENSE.
  set -euo pipefail
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  usage() { echo "usage: LABS_PUBLISH_DIR=<dir> scripts/labs-gate.sh ossify|ossify-apply|gate [extra args]"; }
  [ "${1:-}" ] || { usage; exit 2; }
  DIR="${LABS_PUBLISH_DIR:-}"
  if [ -z "$DIR" ] || [ ! -f "$DIR/ossify.mjs" ] || [ ! -f "$DIR/gate.mjs" ]; then
    echo "LABS_PUBLISH_DIR must point at the directory containing ossify.mjs and gate.mjs" >&2; usage >&2; exit 2
  fi
  cmd="$1"; shift
  case "$cmd" in
    ossify)       exec node "$DIR/ossify.mjs" --repo "$ROOT" "$@" ;;
    ossify-apply) exec node "$DIR/ossify.mjs" --repo "$ROOT" --apply "$@" ;;
    gate)         exec node "$DIR/gate.mjs" --repo "$ROOT" "$@" ;;
    *) usage; exit 2 ;;
  esac
  ```
  **Done when:** `scripts/labs-gate.sh gate; echo $?` without the variable prints the message and `2`; `unset LABS_PUBLISH_DIR`-less run is covered; with the variable set `scripts/labs-gate.sh ossify | tail -20` prints the DRY RUN report.
  **Watch out:** the file contains no path of the private tooling and no word from the framing list; do not add `policy.json` handling at all. The header uses `#` lines after the shebang, which is the form ossify itself writes for `.sh`.
- [ ] 6.2 Prove the dry run is clean for A's files
  **How:** `node scripts/spdx-check.mjs && scripts/labs-gate.sh ossify > "$TMPDIR/ossify.txt"; grep -n "headered\|FOREIGN\|THIRD-PARTY" "$TMPDIR/ossify.txt"`.
  **Done when:** the report shows `0  headered` for the files you created (they already carry the header) and no FOREIGN COPYRIGHT or THIRD-PARTY section. Files under `plans/`, `openspec/`, `.claude/` may appear in "no comment style"; that is expected.
  **Watch out:** never run `ossify` with `--apply` in this change (that is spec X).

## 7. Internal-path registry

- [ ] 7.1 Create `scripts/internal-paths.json`
  **Why:** one list consumed by the checkers now and by spec X's removal step later.
  **Where:** `scripts/internal-paths.json` (create; JSON carries no header). Do NOT list `plans/` or `openspec/` as a whole: they are published as scrubbed documentation (decision Q16, design D-A8); only the working files named in the JSON are internal.
  **How:**
  ```json
  {
    "paths": [
      ".claude/",
      "CLAUDE.md",
      "scripts/labs-gate.sh",
      "scripts/internal/",
      "scripts/internal-paths.json",
      "plans/evidence/",
      "plans/questions-inbox/",
      "plans/owner-questions.md",
      "plans/manual-steps.md",
      "plans/06-amendments-applied.md"
    ]
  }
  ```
  Teach `scripts/lib/files.mjs` a helper `internalPaths()` that returns this list (empty array when the file is absent, which is the state after X) and a predicate `isInternal(path)` (prefix match for entries ending in `/`, equality otherwise).
  **Done when:** `node -e "import('./scripts/lib/files.mjs').then(m=>console.log(m.isInternal('plans/manual-steps.md'), m.isInternal('plans/00-overview.md'), m.isInternal('openspec/changes/a-repo-bootstrap-labs-compliance/tasks.md')))"` prints `true false false`.
  **Watch out:** the last five entries are planning working files addressed to one person or holding raw run output; change X publishes neutral replacements (`plans/decisions.md`, `plans/prerequisites.md`, `plans/design-history.md`). `spdx-check.mjs` skips internal paths for headers, but `check-repo-rules.mjs` still applies the NO-CI and FORBIDDEN-FILE rules to them (a `.github/` inside `plans/` would still be wrong).

## Last: Verification

- [ ] V.1 Run every command and record the output in the PR description
  - `node --test scripts/tests/` -> `pass 16`, `fail 0`
  - `node scripts/spdx-check.mjs` -> exit 0 (`headers ok`, `names ok`, `license ok`)
  - `node scripts/check-repo-rules.mjs` -> exit 0; `node scripts/check-repo-rules.mjs --docs` -> exit 0 and prints the finding count
  - `LABS_PUBLISH_DIR=... scripts/labs-gate.sh ossify | tail -30` -> dry run, no FOREIGN/THIRD-PARTY section
  - `openspec validate a-repo-bootstrap-labs-compliance --strict` -> valid
  - `git status --short | grep -E '\.env($|\.local)'` -> no output
- [ ] V.2 Chrome E2E scenarios: none (no UI). Scenario ids are not applicable; spec V owns UI scenarios.
- [ ] V.3 `commercetools connect validate`: not applicable (no `connect.yaml` yet; change B).
- [ ] V.4 Definition of Done (plans/04-workflow.md section 4): no `console.log` outside CLI output of the scripts, SPDX present, docs delta recorded below, `/opsx:verify` clean.

## Docs to update (for change W)

- README: keep the banner verbatim as the first block; add "Status: unsupported" and a link to SUPPORT.md in the table of contents.
- CONTRIBUTING: extend with per-folder build/test commands once B/C/O exist; keep the two check commands.
- Config reference: list the `.env.example` policy (empty secrets, placeholders only).
- Document the package-naming rule table (dev name -> published name) in the architecture doc.
- Spec X: consume `scripts/internal-paths.json` for the removal list (agent configuration, internal tooling, planning working files) and run the scrub step over `plans/` and `openspec/`, which are published; run `node scripts/check-repo-rules.mjs --docs --strict` on the scrubbed publication tree.
- Spec W: the README states that `plans/` and `openspec/` are the design documentation of the project (no support implied).
