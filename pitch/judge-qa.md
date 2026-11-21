# SkillForge / WhyGraph Judge Q&A

Short, honest, and defensible answers for hackFront India Grand Finale judges and mentors.

### 1. Isn't this just RAG?
No. Standard RAG takes user text, finds semantically similar text chunks with vector embeddings, and asks an LLM to generate an answer. That fails on code intent because:
1. It cannot distinguish between an active decision and an obsolete decision that was reversed 3 months later.
2. It hallucinates plausible explanations when code history has no record.
SkillForge performs a **deterministic graph walk** in Neo4j. It traverses: `Issue (Bug report)` ➔ `PR (Fix)` ➔ `Author (Person to ask)` ➔ `Changed Files` ➔ `Later PR (SUPERSEDES edge)`. The code strictly restricts citations to records returned by Neo4j, and explicitly refuses when no graph path exists.

### 2. How do you know the graph, and not the model, does the work?
Every tool call and exact Cypher query that ran is displayed on screen and can be inspected in the "View executed Cypher" drawer. Confidence is calculated by deterministic code logic, not model probability. If the AI service is disabled or down, the fixed Cypher graph queries continue to return the full evidence trail and citations with zero AI.

### 3. Why an agent and not fixed queries?
User questions come in many formats: some specify an issue number, some mention a file path, and some describe high-level symptoms like "lost reading time". The retrieval planner dynamically selects the appropriate tool (`findDecisionsByNumber`, `findDecisionsByFileOrSetting`, or `searchDecisions`). Cypher queries execute inside an isolated transaction with an 8-second timeout, read-only permissions, and an automatic rollback (`tx.rollback()`).

### 4. What if the AI extraction is wrong?
Every extracted decision must carry a verbatim quote verified against the original GitHub PR body. If the quote does not exist word-for-word, the record is discarded. Furthermore, SkillForge shows the raw quote and direct GitHub source link so developers can verify the original context with one click.

### 5. Can the AI still make things up when it writes the answer?
No. Citations are enforced in software: the answer may only reference decisions that Neo4j returned. If no matching nodes exist, the code refuses: *"The indexed history could not establish an answer."* When Sarvam AI is enabled for natural language explanation, its prompt strictly instructs it to summarize only the supplied records without adding ungrounded rationale.

### 6. Why Neo4j and not a vector database?
Because architectural rationale is a **multi-hop path**, not a proximity score:
`Issue #127` ➔ `FIXES` ➔ `PR #138` ➔ `TOUCHES` ➔ `File` ➔ `SUPERSEDES` ➔ `PR #112`.
A "replaces" or "reverts" relationship is an edge, not a similarity score. Vector databases treat PR #112 and PR #146 as equally similar to "smart resume" and often quote the superseded setting. Neo4j walks the `SUPERSEDES` edge and tells you #146 invalidated #112.

### 7. How do you detect that a decision was reversed?
Four complementary mechanisms:
1. **Explicit text matching**: detecting patterns like "supersedes", "replaces", or "reverts #N" in PR bodies.
2. **Git revert commits**: identifying commit SHAs created by `git revert`.
3. **Configuration/Preference diffs**: tracking setting keys added in one PR's diff (e.g. `pref_reader.xml`) and subsequently deleted in a later PR's diff. (This is how PR #146 was caught replacing PR #112 without ever naming it).
4. **Graph supersession edges**: explicit `[:SUPERSEDES {basis}]` edges created between Decision nodes.

### 8. How do you calculate confidence?
Deterministic math over verified graph facts:
- `+40` if matched by explicit PR/issue number, file path, or setting key (`+20` if keyword match).
- `+20` for a motivating issue or discussion thread linked to the PR.
- `+20` if no subsequent decision overrides it.
- `+20` for two or more corroborating evidence records.
If total confidence is under 40, the system abstains.

### 9. How does it handle renamed files or modules?
Today it matches by file fragments and PR associations. A full file rename across directories can break exact string matching. Our roadmap includes integrating Git's rename detection (`git log --follow --find-renames`) during repository ingestion to maintain entity continuity across renames.

### 10. What if the reason was decided in Slack or a meeting?
If the decision was not recorded in Git, PRs, issues, or commit messages, SkillForge honestly refuses ("The indexed history could not establish an answer"). Refusing without guessing is a core design feature. Ingesting Slack threads and Notion design documents is future roadmap work.

### 11. Docs drift. Doesn't PR history get stale too?
PR history does not drift because it is an immutable ledger of what was decided at a specific point in time. What goes stale is whether that decision is still the active standard today—and that is exactly what our graph's `SUPERSEDES` detection identifies and marks with a visual strike-through.

### 12. How does it scale to a 10-year monorepo?
Graph ingestion of raw Git metadata requires zero AI (ingesting 5,000+ commits and 70 PRs took under 8 seconds). AI extraction runs once per merged PR at build time (~1.2s and $0.0003 per PR). At question time, queries execute on indexed Neo4j nodes in under 400ms without re-reading repository history.

### 13. What about private repos and security?
For private team handover, engineers supply a fine-grained, repository-scoped GitHub read token. Tokens reside exclusively in ephemeral browser tab memory and are re-authenticated with GitHub on every query. We completed two ArgosX security scans: the baseline scan identified 8 items (parameterization, CSP headers, rate limits); all 8 were remediated; the final scan achieved a 100/100 score with 0 open vulnerabilities. See `pitch/argosx-remediation-log.md`.

### 14. Who pays and why?
The Engineering Manager or VP of Engineering buys a team plan. The primary economic metric is **Time to First Meaningful Commit** during new hire onboarding (reducing it from 3-4 weeks to 1 week) and eliminating senior developer context interruptions. Priced at ₹400/developer/month. Saving just 1 hour of senior developer time per month delivers a 2.5x–5x direct ROI.

### 15. What did you validate with real users?
We conducted 3 qualitative user tests on 21-22 Nov:
1. **SDE-1 at a 35-engineer startup**: Located a tricky migration bug context in 42 seconds versus 45+ minutes of Git Blame and Slack searching.
2. **Tech Lead / Engineering Manager (60 engineers)**: Verified the private handover workflow and confirmed that ₹400/dev/month is well within their discretionary productivity budget.
3. **Open-Source GSoC Contributor**: Confirmed that the refusal on unrecorded queries (Kubernetes billing) built genuine trust compared to ChatGPT hallucinations.
Full logs are in `pitch/customer-interviews.md`.

### 16. Why will GitHub Copilot not just add this?
Copilot, Cody, and Greptile focus on **what** code does (code generation, auto-complete, semantic search). SkillForge focuses on **why** code was written that way: historical decision paths, superseded choices, motivating issues, and honest refusal when the history is silent.

### 17. How big is the market?
Nasscom estimates 5.8 million tech employees in India. Focusing on high-growth product teams (10 to 100 engineers) covers ~450,000 developers across India's startup ecosystem. At ₹400/developer/month (₹4,800/yr), the Serviceable Addressable Market (SAM) is ~₹216 Crore ($26M USD) annually in India alone, before expanding globally.

### 18. Why Futon for the demo?
Futon is an active, open-source Android reader with 71 merged PRs, 68 issues, 400 comments, and 5,181 commits. It contains a real superseded decision (PR #112 to #146) and a real bug-to-fix chain (Issue #127 to PR #138). It is third-party code that we did not author, proving the system works on real-world engineering repositories without planted data.

### 19. What happens when a PR has no useful description?
When a PR has an empty or uninformative description, no AI decision node is created. However, the plain Neo4j graph still links the changed files to the PR, commit SHA, and author login. The UI displays the author as the "Person to ask" and links directly to the GitHub diff.

### 20. What if one PR only partly reverses an older one?
The current graph links the older decision as superseded by the newer PR and displays both in the timeline with their respective dates and changed files. The developer can inspect both GitHub diffs to see the granular delta.

### 21. What is honestly not done?
1. Live automated Git rename detection across directory moves (`git log --follow`) is in design.
2. Cross-repository microservice dependency graphs are planned for v2.
3. We have completed qualitative pilot interviews, but multi-month paid retention across large enterprise teams remains future validation.
