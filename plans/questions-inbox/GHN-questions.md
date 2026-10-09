> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

> SUPERSEDED 2026-10-09 (historical inbox): the admin model is now `ADMIN_EMAILS` + a verified e-mail from the Identity admin sign-in; the `assistant-admin`-style permission group, its key override, claim parsing and permission-capture step no longer exist; test users are an admin user and a non-admin user instead of Teams. See `../owner-questions.md` and `../06-amendments-applied.md`. Entries below that mention the old mechanism are retained for history only.

# Owner questions from changes G, H, N

Local ids GQ/HQ/NQ; "Refined Q-id" is the id to use when merged into plans/owner-questions.md (suggested Q17+). Every question has a default so nothing blocks.

| Local | Refined Q-id | Question | Default answer | Affected specs |
|---|---|---|---|---|
| GQ1 | Q17 | Writes to the project **system prompt** and **tool-call-log mode** become admin-only (`assistant-admin`). In the legacy router any project member could change them for everyone. OK? | Yes, admin-only | G, Q |
| GQ2 | Q18 | Cap the system prompt at 20 000 characters (legacy: no cap; feedback copies it at 100 KB). OK? | Yes, 20 000 | G, N, Q |
| GQ3 | Q19 | `GET /session/:id/messages?customView=X` answers with the messages of the *last matching session* when the requested session's flags do not match (legacy quirk, kept for compatibility). Keep or answer 404? | Keep | G, P, S |
| GQ4 | Q20 | Digest, suggestions and follow-ups always on? (legacy docs mention `FEATURE_SESSION_DIGEST`/`FEATURE_NEXT_PROMPTS`/`FEATURE_SUGGESTIONS` switches that do not exist in code.) | Always on, no switches | G, W |
| HQ1 | Q21 | Chat request time budget: 270 s hard (Connect kills at 300 s) with a 30 s wrap-up reserve. Prefer a more conservative 240 s / 30 s? | 270 s / 30 s | H, B, C |
| HQ2 | Q22 | The query analyzer (decides when tool results are offloaded to BigQuery) has two known prompt-interpolation quirks (result size never shown, tool args rendered `[object Object]`). Fix now (changes model behaviour, needs measurement) or keep as-is? | Keep as-is | H, L |
| HQ3 | Q23 | After a turn is stopped by the time limit, show only a text notice, or also offer a "Continue" suggestion chip? | Text notice only | H, P |
| HQ4 | Q24 | The project system prompt is now injected once into the orchestrator (legacy: repeated inside each agent prompt, missing for custom views). Accept this behaviour change? | Yes | H |
| NQ1 | Q25 | Feedback and back-office threads are kept forever (no retention job; Q13) and audit entries are log lines only (not stored). Acceptable for v1? | Yes | N, E |
| NQ2 | Q26 | Admins can read every user's transcripts in the project (Q8). Keep, with the audit log lines added by N? | Keep + audit | N, Q |
| NQ3 | Q27 | Maximum feedback upload: 10 MiB request, 8 MiB snapshot (legacy 25/24 MiB). Larger client transcripts get a "submit without transcript" 413 hint. OK? | Yes | N, Q |
