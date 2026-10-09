# Release log and procedure (documentation only)

Nothing in this file was executed. No tag was created or pushed, no repository was created, nothing was published. The version 0.1.0 is already set in the four `package.json` files and in `CHANGELOG.md` (checked: `node scripts/release/acceptance.mjs --versions 0.1.0` prints OK). The tag `v0.1.0` is for the owner, after M1 and M13.

## Order (design D3) with status

| Step | Action | Needs | Status |
|---|---|---|---|
| 1 | Clear the blockers of `open-items.md` section 1; archive A to X in order (`openspec archive <id> --yes`) | owner / maintainer | NOT DONE |
| 2 | `node scripts/internal/prepare-publish.mjs --out "$HOME/labs-publish/ai-assistant" --year 2026 --stage all` (add `--ack` only after reading the warnings); gate prints CLEAR | M12 | NOT DONE |
| 3 | Rehearsal on the private staging repository: push the single commit, tag `v0.1.0-rc1`, `node scripts/connect/connect.mjs stage --tag v0.1.0-rc1`, `publish`, `deploy`, `finalize` | M4, M6, M7, M14, M15, M16 | NOT DONE |
| 4 | Full regression on the rehearsal deployment: tiers 0 to 8 of `e2e/02-regression-order.md`; `report.md` without FAIL | M8, M10, M3, M5, M11 | NOT DONE |
| 5 | Rollback rehearsal: tag `v0.1.0-rc2` (trivial README change), `update-code --tag v0.1.0-rc2`, then `update-code --tag v0.1.0-rc1`; `/service/status` 200 and an `e2e-` session from before still readable | step 3 | NOT DONE |
| 6 | Create the public repository and push the single commit; run the gate again on the pushed commit (CLEAR required) | M1, M2, M12 | NOT DONE |
| 7 | `git tag v0.1.0 && git push origin v0.1.0`. Refuse when the gate has not printed CLEAR. | M13 | NOT DONE |
| 8 | Anonymous clone proof: `scripts/internal/anon-proof.sh <public url> <workdir> <log>` (clone at the tag, `env -i`, install, typecheck, test, build all four applications, `commercetools connect validate`) | M14 | NOT DONE |
| 9 | `stage --tag v0.1.0` from the public URL, `publish`, sandbox `deploy`, `finalize`; paste the three URLs into the Merchant Center registrations (M9); repeat tiers 0-3 and E2E-U-01..U-03 | M4, M9, M15, M16 | NOT DONE |
| 10 | `node scripts/release/acceptance.mjs --table` then `--check`, fill `acceptance-evidence.json` with real verdicts and links, `node scripts/release/check-tasks-shape.mjs` | all above | NOT DONE |
| 11 | Archive internal evidence outside git (RQ13) | owner | NOT DONE |

## Rollback

Redeploy the previous tag: `node scripts/connect/connect.mjs update-code --tag <previous>` (stage, publish, redeploy with `--updateConnector`); delete the deployment with `delete --yes` if needed. Custom Objects remain (containers `ai-assistant-*` and `shared-composed-pages`); E has a purge function for emergencies (E notes, task 6.3). A wrong public tag cannot be moved: it forces a new version (design risk R2), which is why the rehearsal tags use `-rc`.

## Gate state observed from X's notes

Not CLEAR. First run: 10 failures, then 0 failures and 17 warnings ("BLOCKED on warnings", CLEAR only with `--ack`); the NEEDS-HUMAN scrub lines (61) and the leak scan (4 BLOCK on rule-text lines) remain. Re-run after the owner decisions.
