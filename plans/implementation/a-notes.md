# Implementation notes: change A (a-repo-bootstrap-labs-compliance)

## Summary

All tasks of `tasks.md` are done and ticked. Added: `LICENSE` (byte-identical to the private ossify output, year 2026), `README.md` (banner + short body), `SUPPORT.md`, `CONTRIBUTING.md`, root `.gitignore`, `scripts/spdx-check.mjs`, `scripts/check-repo-rules.mjs`, `scripts/lib/files.mjs`, `scripts/internal-paths.json`, `scripts/labs-gate.sh`, and 16 `node:test` tests in `scripts/tests/`.

Results:
- `node --test scripts/tests/*.test.mjs` -> pass 16, fail 0.
- `node scripts/spdx-check.mjs` -> exit 0 (headers ok, names ok, license ok).
- `node scripts/check-repo-rules.mjs` -> exit 0; `--docs` -> exit 0, 384 findings (expected in the development tree); `--docs --strict` -> exit 1.
- Negative checks all behave as specified: header-less `.ts`, bad package name, nested `LICENSE`, workflow file, secret-valued `.env.example`, removed banner, framing word in README.
- `scripts/labs-gate.sh gate` without the variable -> exit 2 with message. With it set, `ossify` dry run: 0 headered, 0 foreign copyright, no third-party section.
- `openspec validate a-repo-bootstrap-labs-compliance --strict` -> valid.
- Real private gate run on the committed tree: none of A's files are reported. It reports findings in other changes' planning documents (see TODOs); those belong to change X's scrub.

## Questions (for the owner)

- AQ1 stays open: confirm the unscoped dev names and the holder wording (defaults used).
- The framing words are not spelled in the task text. I took them from the publication skill's rule table (three sales-style words, see `FRAMING_WORDS`) and confirmed only the first one against the real gate output. Please confirm the exact policy patterns match `FRAMING_WORDS` (I did not open `policy.json`).

## Missed features / gaps found in the spec

- `node --test scripts/tests/` (as written in tasks 4.4, 5.6, V.1) fails on Node 22.21: a directory argument is treated as a module path. Working forms: `node --test scripts/tests/*.test.mjs` or plain `node --test`. The spec text should be corrected (not edited here, it is part of this change's tasks; left as is).
- Task 5.4 says `--prose` is "also part of the default run" and `--docs` is separate; the spec does not say whether `--docs` also runs the default checks. I made `--docs` = default checks + docs report.
- The spec scenario "nested `service/LICENSE`" names `check-repo-rules.mjs`, while task 4.3 puts the check in `spdx-check.mjs --license`. Implemented in both (`THIRD-PARTY` rule in the rules checker).
- The spec does not say where the package `private: true` requirement is reported (task 4.2 only); implemented as `NOT PRIVATE` in `spdx-check.mjs --names`. This will matter for change B (every package.json needs `"private": true`).
- `.env.example` rule 2 rejects values with digits-and-hyphen mixes only through the regex; a deployed URL on a host containing `example.` would pass by design.
- Docs hygiene `internal-ref` matches the plain strings `CLAUDE.md`, `.claude/` etc. anywhere in plans/openspec text, which produces many findings (all in change texts that mention those paths). Change X's scrub must handle them.
- The checker requires headers for `.sh`, `.css`, `.scss` but the real gate does not; kept as specified (D-A7).

## TODOs

- Real gate findings in other changes' documents, for change X: 4 secret-pattern hits (the PEM marker string written in change F's spec and change U's tasks, in the tree and in history commit 290c23f), 60 framing WARNs (including the staged `.claude/` onboarding skill text and several change documents), 32 "name (review)" hits. Not touched, per rules.
- Task 1.1 asked for `git switch -c spec/a`; see Deviations.
- Manual steps M1/M2 (repo creation, org property) belong to change X; not done.
- Unverified: behaviour of `check-repo-rules.mjs` on Windows paths; behaviour when run outside a git repository (walker fallback exists but is untested).
- Year in headers and LICENSE is 2026; X must pass `--year` for the publication year.

## Deviations from the spec (with reason)

- Branch: stayed on the worktree branch assigned to me instead of creating `spec/a` (the harness created the worktree branch; the worktree branch was first fast-forwarded to `develop` because it started from the initial commit without the plans).
- `.gitignore`: the repository already had a tiny `.gitignore` (`.claude/settings.local.json`, `node_modules/`, `.env.local`, `plans/evidence/`); I replaced it with the specified list and kept `.claude/settings.local.json` in it.
- Test command form (see gaps).
- `README.md` previously contained a one-line title; replaced by the banner plus a short body.
- `LABS_PUBLISH_DIR` was pointed at the installed publication skill's `scripts` directory (not recorded in any file).
