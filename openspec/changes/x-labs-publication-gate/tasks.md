## 0. Read first

About 1.5 hours. This change ends in an irreversible action, so read before touching anything.

- [x] 0.1 Read the change documents and the publication procedure
  - `openspec/changes/x-labs-publication-gate/{proposal.md,design.md,specs/labs-publication/spec.md}`; `openspec/changes/a-repo-bootstrap-labs-compliance/design.md` (E1-E11).
  - The private labs publication skill: `SKILL.md` (Steps 1-4), `scripts/ossify.mjs` (top-of-file comment and the `SKIP_*` lists), `scripts/gate.mjs` (header comment and "checks" section). `policy.json`: you may run the tools that read it, you must never copy, print or commit it.
  - `plans/owner-questions.md` Q10, Q16 (decided: `plans/` and `openspec/` are published, scrubbed); `plans/manual-steps.md` M1, M2, M12, M13; `plans/01-source-inventory.md` section 4; `plans/04-workflow.md` section 6.
  - Skim every `docs/*.md`, `README.md`, `connect.yaml` of the finished repo: you are about to publish them.
  - You should now be able to explain: (1) why a force-push cannot remove a leaked commit, (2) why the tree is built from `git archive` and not from the working directory, (3) why ossify is run before the single commit and the gate after it, (4) what `--ack` may and may not clear, (5) why the leak patterns file must not be in the published tree, (6) why `plans/` and `openspec/` are scrubbed on the publication copy and never in the development repository, (7) why no document may quote a concrete leak token.

## 1. Setup

- [ ] 1.1 Verify preconditions
  - Run: `cd /Users/behnam/code/commercetools-labs/ai-assistant && git switch main && git status --short | wc -l && openspec list`
  - Expected: `0` uncommitted changes; every change except X and Z archived (`openspec list` shows only `x-labs-publication-gate` and `z-release-verification`; V and W archived with `openspec archive <id> --yes`, which also syncs `openspec/specs/`).
  - Run: `export LABS_PUBLISH_DIR=<dir with ossify.mjs gate.mjs policy.json> && ls "$LABS_PUBLISH_DIR" && command -v gh && gh auth status | head -3`
  - Expected: the three files; `gh` installed and authenticated (needed only for the manual steps in section 9).
- [ ] 1.2 Choose and clear the output directory
  - Run: `export PUB="$HOME/labs-publish/ai-assistant" && rm -rf "$PUB" && mkdir -p "$(dirname "$PUB")" && echo "$PUB"`
  - Expected: path printed. The directory is outside the development repository on purpose.
  - Evidence folder: `mkdir -p plans/evidence/x` (git-ignored).

## 2. Leak check tooling (internal only)

- [x] 2.1 Create `scripts/internal/leak-patterns.json`
  **Why:** the private gate does not know our repo's specific hazards, and the documentation is published too, so it must be scanned with the same list.
  **Where:** `scripts/internal/leak-patterns.json` (create; this folder is listed in `scripts/internal-paths.json` and removed from the publication).
  **How:** JSON with three arrays of case-insensitive regex strings. Every pattern uses a character-class escape so the pattern text cannot match itself (a character class such as `[k]` breaks the literal), because this file's content is quoted in published documents only in this escaped form. `blockPrivate` is filled from the maintainer-supplied private list (store identifiers, research-firm and customer-scenario names, GCP project ids, UUIDs) and is never written into any other file.
  ```json
  {
    "block": [
      "/User[s]/", "/hom[e]/[a-z]", "[A-Za-z]:\\User[s]",
      "multitenant-ai-assistan[t]", "multitenant-chat-ap[p]", "commercetools-dem[o]", "ct-builder[s]",
      "ngro[k]", "\\.run\\.ap[p]", "localhost:808[0]",
      "CSR_IMPERSONATE_KE[Y]", "x-mc-team-i[d]",
      "\\.claud[e]/", "CLAUDE\\.m[d]", "labs-gat[e]\\.sh", "internal-path[s]\\.json", "scripts/interna[l]/",
      "questions-inbo[x]", "evidenc[e]/",
      "\\bowne[r]\\b",
      "@commercetools\\.co[m]", "behna[m]"
    ],
    "blockPrivate": [],
    "review": [ "\\btenant", "multitenan[t]", "firestor[e]", "cloud ru[n]", "\\bgec[x]\\b", "\\bPO[C]\\b", "pre-?sale[s]", "\\bdem[o]\\b" ]
  }
  ```
  **Done when:** `node -e "const j=JSON.parse(require('fs').readFileSync('scripts/internal/leak-patterns.json','utf8')); console.log(j.block.length, Array.isArray(j.blockPrivate))"` prints `22 true` (or more); `node -e "console.log(require('./scripts/internal-paths.json').paths.includes('scripts/internal/'))"` prints `true`; `grep -rEn "$(node -e "console.log(require('./scripts/internal/leak-patterns.json').block.join('|'))")" scripts/internal/leak-patterns.json` prints nothing (no pattern matches its own text).
  **Watch out:** the `blockPrivate` list and the regexes for gate-internal identifiers must never appear in this repository's documents (design D-X2). The pattern for the person-addressed role word is intentionally strict: after the scrub none may remain, so ownership in the sense of file ownership is worded "maintainer of the file" in all documents. Corporate role addresses wanted in SUPPORT.md must be added to an `allow` list deliberately (extend the script, do not weaken the pattern).
- [x] 2.2 Create `scripts/internal/leak-check.mjs`
  **Where:** `scripts/internal/leak-check.mjs`, tests `scripts/internal/tests/leak-check.test.mjs`.
  **How:** `node scripts/internal/leak-check.mjs --root <dir> [--policy-dir "$LABS_PUBLISH_DIR"]`. Walk `<dir>` including `plans/` and `openspec/` (skip `.git`, `node_modules`), skip binary files (NUL byte in first 8 KB), load `block`, `blockPrivate` and `review` patterns from the JSON next to the script, load customer names from `<policy-dir>/policy.json` field `block.names` and turn each into `\bname\b` with spaces matching `[\s-]?` (same rule as the gate, see its `nameToPattern`). Print `BLOCK path:line match` and `REVIEW path:line match`; exit 1 if any BLOCK, else 0. Export `scanText(text, patterns)` for tests.
  **Done when:** `node --test scripts/internal/tests/` passes tests `leak: block pattern hit`, `leak: pattern does not match itself`, `leak: markdown under openspec is scanned`, `leak: review pattern listed not failed`, `leak: customer name from policy`, `leak: binary skipped`, `leak: line numbers` (tests inject a fake policy object, never the real file).
  **Watch out:** do not print the content of `policy.json` anywhere, including in error messages. Print only the matched text of the offending line (truncate to 150 chars) as the gate does.

## 3. Scrub of the planning and specification documents

`plans/` and `openspec/` are published (decision Q16), so they go through the same hygiene as code. Design: D-X3, D-X10 to D-X13.

- [x] 3.1 Write the neutral replacement documents in the development repository
  **Why:** the question list, the manual-steps list and the amendments log are addressed to one person and carry inbox ids; the published tree needs neutral equivalents and the specs keep citing ids such as `Q16` and `M12`.
  **Where:** create `plans/decisions.md`, `plans/prerequisites.md`, `plans/design-history.md` (published, hand-written, no header needed).
  **How:** (1) `decisions.md`: one row per decided question: `| id | Decision | Rationale | Affects |` (keep ids `Q2`...`Q52`; drop inbox-local ids; no sentence addressed to a person; state what was decided as fact, e.g. "Q16: `plans/` and `openspec/` are published after a scrub"). (2) `prerequisites.md`: one row per manual step: `| id | Prerequisite | Provided by (role) | Needed by | Details |` (roles: maintainer, org admin, test-account holder); no personal names, no local paths, no secrets, no company-internal URLs. (3) `design-history.md`: the corrections and amendments table, without references to private repositories (state the corrected fact, not where it was found). (4) Confirm the three originals are in `scripts/internal-paths.json` (change A task 7.1).
  **Done when:** every id referenced anywhere in `openspec/changes/*/` as `Q<n>` or `M<n>` appears in the new files: `grep -rhoE '\b[QM][0-9]+\b' openspec plans/0*.md | sort -u > "$TMPDIR/ids.txt"; for i in $(cat "$TMPDIR/ids.txt"); do grep -qE "\b$i\b" plans/decisions.md plans/prerequisites.md || echo "MISSING $i"; done` prints nothing.
  **Watch out:** do this after the last open question is decided (task 1.1 precondition); do not delete the originals (they stay internal). Review the text for private-repository references: rewrite as neutral statements.
- [x] 3.2 Create `scripts/internal/scrub-docs.mjs`
  **Why:** one repeatable script instead of a manual rewrite; the same table is reused by the leak tests.
  **Where:** `scripts/internal/scrub-docs.mjs`, tests `scripts/internal/tests/scrub-docs.test.mjs`.
  **How:** `node scripts/internal/scrub-docs.mjs --root "$PUB" [--private-substitutions <json>] [--report <file>]`. Refuse a `--root` that is not under `$HOME/labs-publish/` or that contains a `.git` of the development repository (compare to `git rev-parse --show-toplevel` of the script). Process `*.md`, `*.yaml`, `*.json` under `<root>/plans` and `<root>/openspec` (not binary, not `node_modules`). Export a constant `SUBSTITUTIONS` implementing the table of design D-X10 in order; keep fenced code blocks (the table applies inside them too: commands containing local paths are rewritten to `<repo>`); do not touch lines that are checkbox markers other than the text after the marker (so `- [x]` and `- [ ]` counts stay identical). Source-map tables: when a header cell matches `Legacy file`, rename it to `Origin` and replace every cell of that column by `legacy implementation` plus the file's base name without line numbers. After substitutions re-scan with the leak block list (the same JSON as task 2.1) and with extra checks: leftover `file:line` citations (`\.(ts|tsx|mjs|js|json|md):\d+`), inbox-local ids (`\b[A-Z]{1,3}Q-?[A-Z0-9]*\d+\b` that is not defined in `plans/decisions.md`), and lines containing `you `/`your ` inside `plans/` documents (second-person address; review only). Print per-file substitution counts, a total, and `NEEDS-HUMAN path:line reason`; exit 1 while any NEEDS-HUMAN remains. Running it twice must report 0 substitutions.
  **Done when:** `node --test scripts/internal/tests/` passes tests `scrub: absolute path with line citation`, `scrub: dev checkout root becomes repo placeholder`, `scrub: source-map header renamed to Origin`, `scrub: role word and person-addressed phrases`, `scrub: framing words replaced and listed`, `scrub: idempotent`, `scrub: checkbox counts unchanged`, `scrub: refuses root outside labs-publish`, `scrub: needs-human on unknown private name`, `scrub: inbox id defined in decisions is accepted`.
  **Watch out:** tests use in-memory strings or temp directories; the tokens for the fixtures are built by concatenation so that the test file itself passes the leak scan (it is internal-only anyway, but keep the habit). Never run the script with `--root` set to the development repository: the script refuses, and this protects the planning files.
- [ ] 3.3 First scrub rehearsal and fixing in the development repository
  **Why:** the first run will report many NEEDS-HUMAN lines; they are fixed at the source.
  **How:** `node scripts/internal/prepare-publish.mjs --out "$PUB" --stage archive && node scripts/internal/scrub-docs.mjs --root "$PUB" --report plans/evidence/x/scrub-report.txt`. For each NEEDS-HUMAN line, fix the owning document in the development repository (internal rationale about a private repository becomes a neutral statement; person-addressed text is rewritten; a rule description that quotes a leak token is rewritten to describe the class), commit, then rebuild `$PUB` from the archive stage. Repeat until the script exits 0.
  **Done when:** `node scripts/internal/scrub-docs.mjs --root "$PUB"` exits 0 on a fresh archive; `node scripts/internal/leak-check.mjs --root "$PUB" --policy-dir "$LABS_PUBLISH_DIR"` reports `0 BLOCK` for `plans/` and `openspec/`; `openspec validate --all --strict` run inside `$PUB` exits 0; the development repository is unchanged by the scrub (`git status --short` shows only your intended source fixes).
  **Watch out:** the scrub's output is for publication only; do not copy files from `$PUB` back into the development repository. A rule description that changed meaning after a framing-word substitution is a defect of the source text: reword it there (describe the words as "the three framing words of the checker").

## 4. Preparation script

- [x] 4.1 Create `scripts/internal/prepare-publish.mjs` (archive, prune, scrub)
  **Why:** one repeatable command instead of a checklist.
  **Where:** `scripts/internal/prepare-publish.mjs`.
  **How:** `node scripts/internal/prepare-publish.mjs --out "$PUB" [--year 2026] [--stage archive|scrub|ossify|check|commit|gate|all]` (default `all`, each stage idempotent from the previous output). Stage `archive`: refuse if `git status --porcelain` is not empty or `--out` exists and is non-empty; run `git archive --format=tar HEAD | tar -x -C "$PUB"` via `execFileSync` pipes; remove every path from `scripts/internal-paths.json` (read it from the development repo, not from `$PUB`) from `$PUB`; then assert none of `.github`, `Dockerfile*`, `netlify.toml`, `.env*` (except `.env.example`) exists anywhere in `$PUB`, and that `plans/decisions.md`, `plans/prerequisites.md`, `plans/design-history.md` exist. Stage `scrub` runs task 3.2's script on `$PUB` and stops on a non-zero exit.
  **Done when:** `node scripts/internal/prepare-publish.mjs --out "$PUB" --stage archive && ls -a "$PUB"` shows `LICENSE README.md SUPPORT.md CONTRIBUTING.md connect.yaml service mc-app composed-apps mc-view-app scripts docs plans openspec` and none of the agent configuration folder or the agent instructions file; `find "$PUB/scripts" -name 'internal*'` prints nothing.
  **Watch out:** `--out` inside the development repo is refused (path check). Never `rm -rf` anything outside `$PUB`; validate `path.resolve(out)` starts with `$HOME/labs-publish/` unless `--allow-any-out`.
- [x] 4.2 Stage `ossify`: dry run, review, apply, metadata
  **How:** (1) run `node "$LABS_PUBLISH_DIR/ossify.mjs" --repo "$PUB" --year <y> | tee plans/evidence/x/ossify-dry.txt`; the script prints the report and stops if it contains `FOREIGN COPYRIGHT` entries other than 0 or a `THIRD-PARTY DIRECTORIES EXCLUDED` section (exit 1: investigate, e.g. a vendored file with someone else's copyright). (2) run `--apply`, save `ossify-apply.txt`. (3) for every `package.json` set `repository: {"type":"git","url":"git+https://github.com/commercetools/ai-assistant.git","directory":"<folder>"}` (omit `directory` for `scripts/`), `bugs: {"url":"https://github.com/commercetools/ai-assistant/issues"}`, `homepage: "https://github.com/commercetools/ai-assistant#readme"`, preserving 2-space indent. (4) re-run the dry run, save `ossify-second.txt`, assert `0  headered` and `0  package.json renamed`.
  **Done when:** the second report shows `0  package.json renamed`, `0  headered`, `0  FOREIGN COPYRIGHT`; `node -e` over all package.json prints names starting `@commercetools-labs/ai-assistant`.
  **Watch out:** a `1  no comment style` line for the new `LICENSE` file is expected (verified in design E1). If ossify headers a file the development repo checker had accepted (or vice versa), the checkers disagree: fix the checker constants in change A's script (they must mirror the gate) and note it in the evidence.
- [ ] 4.3 Stage `check`: run all our checkers inside the publication tree
  **How:** in `$PUB`: `node scripts/spdx-check.mjs`, `node scripts/check-repo-rules.mjs`, `npm ci --prefix scripts && node scripts/check-connect-layout.mjs`, `node scripts/check-repo-rules.mjs --docs --strict` (zero findings required), `(cd "$PUB" && openspec validate --all --strict)`, then `node <dev repo>/scripts/internal/leak-check.mjs --root "$PUB" --policy-dir "$LABS_PUBLISH_DIR" | tee plans/evidence/x/leak.txt`. Stop at the first failure.
  **Done when:** all exit 0; the docs-hygiene run prints `docs hygiene: 0 finding(s)`; `openspec validate --all --strict` is valid after the scrub; the leak report has `0 BLOCK` for ALL files including `plans/` and `openspec/`; read every `REVIEW` line and decide: reword in the development repo (preferred) or accept with a reason written to `plans/evidence/x/leak-review.md`.
  **Watch out:** `check-repo-rules` skips internal paths via `scripts/internal-paths.json`, which no longer exists in `$PUB`: the helper must treat a missing file as an empty list (task 7.1 of change A); verify this case here.
- [x] 4.4 Unit-test the preparation script's pure parts
  **Where:** `scripts/internal/tests/prepare-publish.test.mjs`.
  **How:** tests `prune: removes listed paths and keeps plans and openspec`, `prune: refuses out inside the repo`, `prune: detects forbidden leftovers (.github, Dockerfile, .env)`, `metadata: sets repository fields and keeps indent`.
  **Done when:** `node --test scripts/internal/tests/` passes all (7 leak + 4 prepare + 10 scrub tests).
  **Watch out:** tests run on temp directories created with `fs.mkdtempSync`; never against the real repo.

## 5. History strip and listing review

- [ ] 5.1 Stage `commit`: single commit and the `git add --dry-run` review
  **How:** in `$PUB`: `git init -b main`; `git add --dry-run . | sed 's/^add //' | tee plans/evidence/x/add-dry-run.txt | wc -l`; the script then checks every listed path against the forbidden pattern list from the spec (`(^|/)\.env($|\.)` except `.env.example`, `node_modules/`, `/build/`, `/public/`, `\.log$`, `\.DS_Store`, `\.pem$`, `\.key$`) and prints the 20 largest files with sizes (anything over 1 MB must be justified in the evidence); only then `git add . && git commit -F plans/evidence/x/commit-message.txt`.
  **Done when:** `git -C "$PUB" rev-list --count HEAD` prints `1`; `git -C "$PUB" ls-files | wc -l` equals the dry-run count.
  **Watch out:** read the dry-run listing yourself, top to bottom (the labs skill says "READ THIS before the real add"). If it contains anything unexpected, fix it in the development repo and start over; do not delete files from `$PUB`.
- [x] 5.2 Write the commit message
  **Where:** `plans/evidence/x/commit-message.txt` (internal).
  **How:** subject `Initial release of the AI Assistant for the Merchant Center (commercetools Labs)`; body 8-12 lines: what the project is (single-tenant, deployed with commercetools Connect, Gemini via Vertex AI, state in Custom Objects), that it is freely available, AS IS and UNSUPPORTED, MIT licensed, what to read first (README, docs/deployment-runbook.md). No internal repo names, no customer or store names, none of the sales-style framing words and not the word for the legacy multi-customer design (the leak check proves it). Mention that `plans/` and `openspec/` are the design documentation.
  **Done when:** `node scripts/internal/leak-check.mjs --root plans/evidence/x --policy-dir "$LABS_PUBLISH_DIR"` reports no BLOCK for `commit-message.txt`.
  **Watch out:** the commit author is the configured git identity of the person publishing (open question XQ2); check `git -C "$PUB" config user.email` is the intended address before committing.

## 6. Gate

- [ ] 6.1 Stage `gate`: run the blocking gate on the commit
  **How:** `node "$LABS_PUBLISH_DIR/gate.mjs" --repo "$PUB" | tee plans/evidence/x/gate.txt; echo exit=$?`
  **Done when:** the output ends with `CLEAR.` and `exit=0`. If it prints WARN findings, it ends with `BLOCKED on warnings`: read each (framing words, ambiguous names), fix in the development repo when it is real, otherwise re-run with `--ack` and append `finding -> reason` lines to `plans/evidence/x/gate-ack.md`. FAIL findings have no override.
  **Watch out:** any change to `$PUB` (even whitespace) makes the tree dirty and the gate exits 2: rebuild from step 4.1 instead of editing. Run the gate immediately before the push (section 9), not only here.
- [ ] 6.2 Re-run the gate against the final commit id and record it
  **How:** `git -C "$PUB" rev-parse HEAD | tee plans/evidence/x/final-sha.txt`; run `gate.mjs --repo "$PUB" --ref "$(cat plans/evidence/x/final-sha.txt)"`.
  **Done when:** `CLEAR` again; the sha file exists.
  **Watch out:** this sha is the exact commit the maintainer approves in M12.

## 7. Anonymous-clone proof

- [x] 7.1 Create `scripts/internal/anon-proof.sh`
  **Why:** the claim a labs repo makes is that it builds for anyone.
  **Where:** `scripts/internal/anon-proof.sh` (chmod +x; internal-only, no header needed).
  **How:** args: source (a local path or a GitHub URL) and work dir. Steps: `rm -rf "$W" && git clone "$SRC" "$W/repo"`; run every command through `env -i HOME="$W/home" PATH="$PATH" NODE_ENV=` (scrubbed environment: no `LABS_PUBLISH_DIR`, no cloud credentials, no `.env`): `(cd service && npm ci && npm run build && npm test)`, `(cd mc-app && yarn install --frozen-lockfile && yarn typecheck && yarn build)` with the placeholder env from `.env.example` exported, same for `composed-apps` and `mc-view-app`, `npm ci --prefix scripts && node --test scripts/tests/`, `node scripts/spdx-check.mjs`, `node scripts/check-repo-rules.mjs`, `node scripts/check-connect-layout.mjs`, `commercetools connect validate`. Log each step name and exit code; stop on first failure; write the log to the path in `$3`.
  **Done when:** `scripts/internal/anon-proof.sh "$PUB" "$HOME/labs-publish/proof" plans/evidence/x/anon-proof.log; echo $?` prints `0` and the log ends with `ALL STEPS PASSED`.
  **Watch out:** needs network and Docker (validate); allow 20-40 minutes. If `npm ci` complains about the lockfile name, record it and fix by regenerating the lockfile in the development repo (design E3 says it should not).
- [ ] 7.2 Review the proof log for scrub-induced differences
  **How:** compare package versions and test counts with the development run (change V's regression checklist); any test skipped only because an env var is absent must be named in the log as `SKIPPED (needs GCP_SA_KEY_BASE64)` and be an intended skip.
  **Done when:** the evidence file `plans/evidence/x/proof-review.md` lists: tests run per package, tests skipped with reason, build outputs present (`service/build/index.js`, `*/public/index.html`).
  **Watch out:** the live Gemini smoke test (change F) must skip cleanly without credentials.

## 8. Maintainer review package

- [ ] 8.1 Assemble the M12 approval request
  **How:** write `plans/evidence/x/approval.md` containing: final sha, `git -C "$PUB" ls-files | wc -l`, the LICENSE holder line, the README first 15 lines, the list of removed internal paths, the scrub report (substitution counts and every framing-word substitution line), the `openspec validate` and `--docs --strict` results, a read-through list of the 20 files with the most substitutions, the ossify second-run report, the leak REVIEW decisions, the gate output tail, the proof log tail, and these checkboxes: `[ ] M12 maintainer approval recorded (LICENSE holder text, README banner, removal of internal paths, scrubbed plans/openspec read-through)`, `[ ] M2 org property commercetools-labs exists`, `[ ] M1 repository may be created public now`.
  **Done when:** file exists; ask the maintainer (plain message with the path) and WAIT. Do not continue to section 9 until the first box is ticked by the maintainer.
  **Watch out:** the agent never ticks M12 itself.

## 9. Publication (manual, maintainer-approved)

- [ ] 9.1 `[MANUAL M2]` Ensure the org custom property exists
  **How (admin):** in the `commercetools` org settings the custom property `commercetools-labs` of type true/false must exist. Check with `gh api orgs/commercetools/properties/schema | grep commercetools-labs`.
  **Done when:** the grep prints the property; otherwise ask an org admin to create it (the PATCH in 9.3 returns 422 without it).
- [ ] 9.2 `[MANUAL M1]` Create the public repository and push
  **How (needs org rights; run only after M12):**
  ```bash
  cd "$PUB"
  node "$LABS_PUBLISH_DIR/gate.mjs" --repo .          # must still say CLEAR immediately before the push
  gh repo create commercetools/ai-assistant --public --description "AI Assistant for the Merchant Center - freely available, unsupported (commercetools Labs)" --source . --remote origin
  git push -u origin main
  ```
  **Done when:** `gh repo view commercetools/ai-assistant --json visibility,defaultBranchRef` shows `PUBLIC` and `main`.
  **Watch out:** never `--private` first (a force-push does not remove commits that were public; deletion is the only repair). If the gate is not CLEAR, stop.
- [ ] 9.3 `[MANUAL M1]` Mark it as a labs repository
  **How:**
  ```bash
  gh api -X PATCH repos/commercetools/ai-assistant/properties/values \
    -f 'properties[][property_name]=commercetools-labs' -f 'properties[][value]=true'
  gh repo edit commercetools/ai-assistant --add-topic labs
  ```
  **Done when:** `gh api repos/commercetools/ai-assistant/properties/values` lists `commercetools-labs` = `true`; `gh repo view commercetools/ai-assistant --json repositoryTopics` contains `labs`.
  **Watch out:** 422 means M2 is not done.
- [ ] 9.4 Post-publication verification
  **How:** `scripts/internal/anon-proof.sh https://github.com/commercetools/ai-assistant.git "$HOME/labs-publish/proof-public" plans/evidence/x/anon-proof-public.log`
  **Done when:** log ends with `ALL STEPS PASSED`; record the final public sha equals `final-sha.txt`.
  **Watch out:** if anything fails, follow the rollback in 9.5 only for leaks; build failures are fixed by a normal follow-up commit in the public repo (history is already public, so a normal commit is fine).
- [ ] 9.5 Rollback procedure (read now, use only for a leak)
  **How:** (1) `gh repo delete commercetools/ai-assistant --yes` (org rights); (2) rotate every credential that could have been exposed (Google service-account key, any API client secret, `ENCRYPTION_KEY` consequences: stored secrets must be re-entered); (3) fix the cause in the development repo; (4) rebuild from section 4 with a new `$PUB`; (5) wait until GitHub has released the name (rename redirects can hold it for a while) and recreate with 9.2.
  **Done when:** documented in `docs/` is NOT required (internal); the steps are in `plans/evidence/x/rollback.md` for the publisher.
  **Watch out:** deleting does not remove forks or clones made while public; assume the leaked data is compromised.

## Last: Verification

- [ ] V.1 Commands and expected results
  - `node --test scripts/internal/tests/ scripts/tests/` -> all pass
  - `node scripts/internal/prepare-publish.mjs --out "$PUB" --stage all` -> exit 0 (archive, prune, scrub, ossify, checks, commit, gate), one commit, `CLEAR`
  - `node scripts/internal/scrub-docs.mjs --root "$PUB"` (second run) -> `0 substitutions`, exit 0
  - `node scripts/check-repo-rules.mjs --docs --strict` in `$PUB` -> `docs hygiene: 0 finding(s)`
  - `(cd "$PUB" && openspec validate --all --strict)` -> all changes and specs valid (run after the scrub, before the commit)
  - `find "$PUB/plans" "$PUB/openspec" -name '*inbox*' -o -name '*evidence*' | wc -l` -> `0`; `ls "$PUB/plans"` lists `decisions.md prerequisites.md design-history.md`
  - `node "$LABS_PUBLISH_DIR/ossify.mjs" --repo "$PUB" | grep -E "headered|renamed|FOREIGN"` -> `0  headered`, `0  package.json renamed`, `0  FOREIGN COPYRIGHT`
  - `node scripts/internal/leak-check.mjs --root "$PUB" --policy-dir "$LABS_PUBLISH_DIR"` -> `0 BLOCK` over all files, including `plans/` and `openspec/`
  - `scripts/internal/anon-proof.sh "$PUB" ...` -> `ALL STEPS PASSED`
  - `find "$PUB" -path '*/.github/*' -o -name Dockerfile* | wc -l` -> `0`
  - After M1: `scripts/internal/anon-proof.sh https://github.com/commercetools/ai-assistant.git ...` -> `ALL STEPS PASSED`
  - `openspec validate x-labs-publication-gate --strict` -> valid
- [ ] V.2 Unit tests to exist (names above): 7 leak tests, 4 prepare tests, 10 scrub tests.
- [ ] V.3 Chrome scenarios: none for X itself. The proof runs after V's scenarios passed on the development repo; optionally re-run `E2E-*` smoke scenarios against a deployment built from the public tag (change Z).
- [ ] V.4 Leak-check classes covered at zero BLOCK in every tracked file: customer names (policy), internal hosts and project ids (gate internal patterns and the private list), tunnel and deployed-service hosts, absolute local paths, names of the private repositories and the internal organisation, agent-config and internal-tooling names, question-inbox and evidence folder names, person-addressed role words, personal e-mail addresses, secrets. Run record saved in `plans/evidence/x/`.
- [ ] V.5 Checkbox counts: `grep -c '^- \[x\]' ` and `grep -c '^- \[ \]'` per `tasks.md` are identical before and after the scrub.

## Docs to update (for change W / Z)

- README: link to the repository's own `CONTRIBUTING.md`; no mention of the publication toolchain.
- Change Z checklist: tag `v0.1.0` after publication is manual step **M13** (`git tag` on the public repo, then `connectorstaged create` with the public URL and tag, see change U).
- Internal handbook (outside this repo): the publication runbook in this file, the rollback steps and the list of tokens in `leak-patterns.json`.
- Ask the labs tooling maintainers (XQ3) to add the repo-specific tokens to the private `policy.json`.
- Change W: README states that `plans/` and `openspec/` are the design documentation (no support implied); change Z archives X and Z in the public repository after the release; changes W/Z/A text must keep avoiding concrete leak tokens.
