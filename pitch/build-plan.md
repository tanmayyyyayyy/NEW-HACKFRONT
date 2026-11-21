# Finale Build Plan: SkillForge

Team Tanmay | hackFront India Grand Finale, IIIT Delhi, 21-22 Nov 2026
Challenge: PS T1.1 "Why The Code Is Like This"

**What it is:** SkillForge answers "why is the code like this?" from a repository's verified GitHub history and Neo4j graph relationships. It returns a deterministic chain of evidence: the motivating issue, the PR decision, the author to ask, changed files, and superseded historical changes. It strictly refuses when the history has no answer, eliminating AI hallucinations.

## 1. Project Implementation Status (Final Build, 22 Nov 2026)

| Part | Status |
|---|---|
| GitHub history collected for AppFuton/Futon: 71 PRs, 68 issues, 400 comments, 5,181 commits | **Done** |
| Three demo cases checked by hand against GitHub (decision chain, supersession, refusal) | **Done** |
| Plain graph in Neo4j (Person, PR, Issue, Commit, File, ConfigKey) with temporary session projections | **Done** |
| Dual-track onboarding: Private Team Handover + Public Repo Learning | **Done** |
| Fine-grained GitHub PAT sign-in with ephemeral tab-memory isolation and instant revocation | **Done** |
| Supersession detection (explicit PR references, git reverts, setting added then removed) | **Done** |
| Neo4j graph question answering with executed Cypher display, timeline cards, and author citations | **Done** |
| Multilingual explanation via Sarvam AI (`sarvam-105b`) in Hinglish, Hindi, and English (opt-in) | **Done** |
| Modern responsive UI with copyable handover notes, Cypher drawer, and zero horizontal overflow | **Done** |
| ArgosX security audit and remediation log completed (0 open vulnerabilities) | **Done** |
| Customer discovery interviews logged with ₹400/developer/month pricing validation | **Done** |
| Fully reproducible test suite (`npm run check:chat`, `npm run check:ui`, `npm run build`) | **Done** |

## 2. Grand Finale Demonstration Cases

A judge or mentor can test the live application and verify:

| Demo Question | Expected System Behavior |
|---|---|
| **Case 1: Decision Chain**<br>`Why preserve reading statistics during source migration? Trace issue #127 and PR #138.` | Chain returned: Motivated by Issue #127 (`BlueStarOne`) ➔ Fixed in PR #138 (`PoonHarpoon`, merged 6 Nov 2026) ➔ Files changed (`ReadingStats.kt`, `SourceManager.kt`) ➔ Author to ask with direct GitHub links. |
| **Case 2: Reversed Decision (Supersession)**<br>`Why did PR #146 replace the chapter update behavior from PR #112?` | Shows PR #112 (merged 19 Sep 2026, opt-in smart resume setting) struck through as **superseded** by PR #146 (merged 19 Nov 2026), which made chapter update waiting the default and removed the setting. Caught via XML preference diffs even though #146 never mentioned #112 in text. |
| **Case 3: Honest Refusal**<br>`Why does Futon use Kubernetes for billing?` | Neo4j query executes, finds zero matching records in repository history, and returns deterministic refusal: *"The indexed history could not establish an answer."* Zero hallucinations, zero invented reasons. Full executed Cypher visible in drawer. |

## 3. Target User Segments & Economic Value

| Segment | Pain Point | Solution in SkillForge |
|---|---|---|
| **Primary:** New engineer at tech startup (10–100 engineers) | Can read what the code does, but cannot find *why*. Senior engineers leave and context is lost. | Instant decision chain lookup (PR + Issue + Author + Supersession) in 40 seconds vs 45+ minutes on Slack/Git Blame. |
| **Buyer:** Engineering Manager / VP Eng | Engineer onboarding takes 3-4 weeks. Senior engineers waste 20% of their time answering repetitive context questions. | Accelerates time to first meaningful commit. Priced at ₹400/developer/month; saves 4+ hours per developer/month (4x–10x ROI). |
| **Secondary:** Open-Source / GSoC Contributor | Fear of submitting a PR that accidentally breaks an older architectural decision or reverted setting. | Public Repo Learning allows exploring past decisions and supersessions before writing code. |

## 4. Why Neo4j is the Core Competitive Advantage

A "why" answer is fundamentally a **graph path**, not a text chunk:
`Issue (Bug report)` ➔ `PR (Fix)` ➔ `Author (Person to ask)` ➔ `Files (Diff)` ➔ `Later PR (SUPERSEDES edge)`.
- Vector databases (RAG) pull text chunks based on semantic similarity. If a question asks about a setting, vector search retrieves PR #112 and confidently presents it as the current answer—even though PR #146 deleted it months later!
- Neo4j follows explicit `SUPERSEDES` and `REFERENCES` edges. If a decision has an outgoing or incoming superseding link, SkillForge visually marks it as overridden.
- The AI (Sarvam / Gemini) is strictly an explainer of retrieved graph facts, not the authority. If the graph returns no nodes, the system refuses.

## 5. Definition of Done
The build compiles cleanly, passes real Neo4j graph assertions, passes mobile and desktop Playwright UI tests, secures private credentials, and is accompanied by full pitch decks and judge Q&A materials.
