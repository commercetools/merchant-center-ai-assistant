# Regression order

Every card in `e2e/*.md` is in exactly one tier below (`node scripts/e2e/extract-scenario-ids.mjs
--tiers` checks it). Run the tiers in order, in one Chrome session per user, after `ATTACH`.

Stop rules:

- Tier 0 fails: the run is `BLOCKED`, no later tier runs, and `report.md` says why.
- Two consecutive FAILs of the same card stop the tier (INFRA failures: repeat the preflight and the
  tier once).
- Tier 7 (destructive and slow) runs only after tiers 1 to 6 are green and only with
  `E2E_ALLOW_DESTRUCTIVE=1`.
- Tier 8 always runs, also after a stopped run, so that nothing is left behind.

Time estimates: smoke (tiers 0 and 1) about 10 minutes; a full local run 90 to 120 minutes; the extra
sandbox cards about 30 minutes plus the long turn and the cold-start wait; tier 7 about 60 minutes.

Environment: cards tagged `Env: local` (restarts, two instances, reduced budget) are skipped on the
sandbox, cards tagged `Env: sandbox` (long turn, cold start, deployment) are skipped locally; the card
says which.

## Tier 0 - preflight
E2E-V-01, E2E-V-08.

## Tier 1 - smoke
E2E-C-01, E2E-D-01, E2E-D-04, E2E-O-01, E2E-O-02, E2E-O-04, E2E-P-01, E2E-P-02, E2E-R-01, E2E-S-01, E2E-K-01.

## Tier 2 - persistence
E2E-E-01, E2E-E-02, E2E-E-03, E2E-G-01, E2E-G-02, E2E-P-06, E2E-P-13.

## Tier 3 - chat features
E2E-H-01, E2E-H-02, E2E-H-03, E2E-H-08, E2E-F-01, E2E-F-03, E2E-G-03, E2E-G-04, E2E-G-05, E2E-G-08,
E2E-P-03, E2E-P-04, E2E-P-05, E2E-P-07, E2E-P-08, E2E-P-10, E2E-P-11, E2E-P-12, E2E-P-14, E2E-P-15,
E2E-J-01, E2E-K-02, E2E-K-03, E2E-L-01, E2E-L-03, E2E-L-04, E2E-L-05, E2E-L-06, E2E-M-01, E2E-M-02,
E2E-M-03, E2E-M-05.

## Tier 4 - identity and admin
E2E-V-13, E2E-I-01, E2E-I-02, E2E-I-03, E2E-I-04, E2E-I-05, E2E-I-05b, E2E-I-06, E2E-Q-03, E2E-Q-04,
E2E-Q-06, E2E-Q-07, E2E-Q-08, E2E-Q-09, E2E-Q-10, E2E-Q-11, E2E-Q-12, E2E-Q-13, E2E-N-01, E2E-N-03,
E2E-N-05, E2E-N-06, E2E-O-06, E2E-G-06, E2E-J-02, E2E-J-03, E2E-J-05, E2E-P-09.

## Tier 5 - apps
E2E-R-02, E2E-R-03, E2E-R-04, E2E-R-05, E2E-R-06, E2E-R-07, E2E-R-08, E2E-R-09, E2E-S-02, E2E-S-03,
E2E-S-05, E2E-S-06, E2E-S-07, E2E-S-08, E2E-S-09, E2E-S-10, E2E-S-11, E2E-S-12, E2E-G-07, E2E-H-06,
E2E-M-06.

## Tier 6 - negative and security
E2E-V-02, E2E-V-03, E2E-V-10, E2E-V-11, E2E-V-12, E2E-C-02, E2E-D-02, E2E-D-03, E2E-D-05, E2E-D-06,
E2E-F-02, E2E-O-03, E2E-Q-14, E2E-Q-15, E2E-N-04, E2E-L-02, E2E-L-07, E2E-L-08, E2E-M-04, E2E-J-06.

## Tier 7 - destructive and slow
Order matters: the binding cards run as a group (unbind, then the unbound-project cards, then bind
again).
E2E-I-07, E2E-Q-02, E2E-S-04, E2E-Q-01, E2E-Q-05, E2E-Q-16, E2E-P-16, E2E-O-05, E2E-H-04, E2E-H-05,
E2E-H-07, E2E-J-04, E2E-K-04, E2E-K-05, E2E-N-02, E2E-V-04, E2E-V-05, E2E-V-06, E2E-V-09, E2E-U-01,
E2E-U-02, E2E-U-03, E2E-U-04, E2E-U-05, E2E-U-06.

## Tier 8 - cleanup and report
E2E-V-07, then `bash scripts/e2e/collect-evidence.sh <run-id>`.
