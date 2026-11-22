# ArgosX Security Remediation Log: SkillForge

Three scans: a baseline early in the build, a pre-deploy check, and the live production scan on Render for the hackFront India Grand Finale at IIIT Delhi.

## Scans

| | Baseline scan | Pre-deploy scan | Live production scan |
|---|---|---|---|
| Date and time | 21 Nov 2026, 18:30 IST | 22 Nov 2026, 02:30 IST | 22 Nov 2026, 10:30 IST |
| Target (repo, commit or URL) | Commit `62ea941` | Commit `54c25f2` / `main` | `https://skillforge-repository-desk.onrender.com` |
| Critical | 1 | 0 | 0 |
| High | 2 | 0 | 0 |
| Medium | 3 | 0 | 0 (1 fixed: HSTS) |
| Low | 2 | 0 | 0 (1 fixed: stdio code tag) |
| Total | 8 | 0 | 0 open |
| Overall Score | 72/100 | 100/100 | **100/100 (Clean Green)** |
| Report link or share | docs/argosx-baseline-62ea941.pdf | docs/argosx-final-54c25f2.pdf | [ArgosX Report twws9pn](https://getargosx.com/r/twws9pn) · [Card](https://getargosx.com/s/twws9pn) |

## Findings & Remediations

| # | Finding (as ArgosX names it) | Severity | Where | Fixed? | Fix, or reason it is accepted | Confirmed in final scan? |
|---|---|---|---|---|---|---|
| 1 | Potential Cypher Injection / String Concatenation | Critical | `lib/repository-chat.ts:160` | Yes | Rewrote all Neo4j queries to use strict parameterized Cypher (`$scope`, `$terms`, `$refs`). Queries run inside isolated transaction with 8-second timeout and explicit `tx.rollback()`. | Yes |
| 2 | Missing Strict Security Headers & CSP | High | `next.config.mjs:4` | Yes | Added strict CSP (`default-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and disabled `x-powered-by`. | Yes |
| 3 | Ephemeral GitHub PAT Storage Boundary | High | `app/account/AccountForm.tsx` & `lib/github-token-signin.ts` | Yes | Verified that fine-grained PATs are transferred only in volatile tab memory via `private-transfer.ts`. Zero persistence in localStorage, sessionStorage, cookies, or database. Rechecked on every request. | Yes |
| 4 | Missing Rate Limiting on Authentication & Inference | Medium | `lib/auth.ts:38`, `lib/query-budget.ts:1` | Yes | Configured SQLite-backed database rate limiting via Better-Auth and per-request query budgets (`withQueryBudget`). | Yes |
| 5 | Server Information & Error Detail Leakage | Medium | `app/api/ask/route.ts:88` | Yes | Normalized all API errors to generic user-facing strings (`RepositoryError`). Server stack traces are isolated to stderr and never leaked in HTTP response bodies. | Yes |
| 6 | Untrusted Content Rendering / XSS Surface | Medium | `app/RepositoryChat.tsx:133` | Yes | PR bodies, discussion comments, and commit messages are strictly treated as text with no `dangerouslySetInnerHTML`. Substrings and excerpts sanitized before display. | Yes |
| 7 | Vulnerable / Outdated Transitive Dependencies | Low | `package.json` | Yes | Executed `npm audit fix`. Zero vulnerabilities reported across all dependencies in production lockfile. | Yes |
| 8 | Origin Header Validation on API Endpoints | Low | `app/api/ask/route.ts:47` | Yes | Enforced strict `Origin` header verification against `APP_ORIGIN` on all POST mutations and inference requests to reject cross-origin abuse. | Yes |
| 9 | Missing Strict-Transport-Security (HSTS) | Medium | `next.config.mjs:8` | Yes | Added `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` header to force HTTPS and eliminate downgrade attacks. | Yes |
| 10 | False-positive Dictionary Typos in Technical Copy | Low | `app/connect/page.tsx:25` | Yes | Enclosed standard I/O protocol abbreviation in semantic `<code>stdio</code>` tag so spellcheck parsers recognize technical transport identifiers. | Yes |

## Summary

Baseline scan found 8 issues. Pre-deploy scan resolved all 8. The live production scan on Render identified 1 missing transport header (HSTS) and 1 technical vocabulary item, both remediated immediately. Total open vulnerabilities: 0. Production app scores 100/100 across Security, Performance, and Accessibility under ArgosX v2.0.339.
