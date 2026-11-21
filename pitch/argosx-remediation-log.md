# ArgosX Security Remediation Log: SkillForge

Two scans: a baseline early in the build, and a final scan by 11 AM on 22 Nov 2026.

## Scans

| | Baseline scan | Final scan |
|---|---|---|
| Date and time | [ ] | [ ] |
| Target (repo, commit or URL) | [ ] | [ ] |
| Critical | [ ] | [ ] |
| High | [ ] | [ ] |
| Medium | [ ] | [ ] |
| Low | [ ] | [ ] |
| Total | [ ] | [ ] |
| Report link or screenshot | [ ] | [ ] |

## Findings

| # | Finding (as ArgosX names it) | Severity | Where | Fixed? | Fix, or reason it is accepted | Confirmed in final scan? |
|---|---|---|---|---|---|---|
| 1 | [ ] | [ ] | [file:line] | [Yes/No] | [ ] | [Yes/No] |
| 2 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 3 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

## Summary

Found [X] issues in the baseline scan. Fixed [Y]. [Z] accepted because [reason, for example: dev-only dependency not shipped to users / false positive, explained above]. Final scan shows [N] open, [none critical or high].

## Likely findings for a Next.js + Neo4j app, and the fix

Use this to act fast on the baseline scan. Only log what ArgosX actually reports.

| Likely finding | Why it matters here | Fix |
|---|---|---|
| Secret in code or git (Neo4j password, Gemini key, GitHub token) | Anyone with the repo can use them | Move to environment variables, keep `.env*` in `.gitignore`, rotate any key that was committed |
| Secret exposed to the browser | A `NEXT_PUBLIC_` variable is shipped to every visitor | Keep keys server-side only; call Neo4j and Gemini from route handlers or server code |
| Cypher injection | User text pasted into a Cypher string, or a query the agent writes, could change or dump data | User text reaches the fixed queries only as parameters (`$search`, `$name`). Agent-written queries run in a read transaction with a 5 s timeout and a row cap; the database rejects writes (tested with a CREATE) |
| Full-text query syntax injection | Lucene characters in the question can break or widen the search | Escape special characters before passing the question to the full-text index |
| Database user with write access | A bug in the answer path could change or delete the graph | Run question answering in read sessions; use a read-only user where the plan allows it |
| Agent-written Cypher (runCypher) | The model writes its own query, which could try to write or run too long | Read transaction with a 5 s timeout; the database rejects writes (verified). Log each query, and show it on screen |
| No rate limit on the ask endpoint | Each answer can call Gemini; abuse costs money | Rate limit per IP; cap question length and the number of agent tool calls |
| Vulnerable dependency | Known flaws in npm packages | Upgrade with `npm audit`; accept only dev-only items, with the reason |
| Missing security headers | Clickjacking, content sniffing | Add CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` in `next.config` headers |
| Error details shown to users | Stack traces or raw queries leak internals | Return a plain error message; log details on the server only |
| Unsafe HTML from PR or issue text | PR bodies are user content and could carry script | Render as text or sanitize markdown; never use raw HTML from GitHub |
| Prompt injection from PR or issue text | A PR body could tell the model to ignore its rules | Pass evidence as data, keep the word-for-word quote check, and let the answer cite only decisions that getDecisionChain returned from Neo4j |
