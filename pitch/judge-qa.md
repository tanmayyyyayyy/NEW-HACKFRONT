# WhyGraph judge Q&A

Short, honest answers. Fill every [placeholder] before the finals. If you do not know, say so.

### 1. Isn't this just RAG?
No. RAG pulls text chunks that look similar to the question. Our agent walks a graph with tools: search decisions, look up by file, setting or PR number, and fetch the chain of PR, person, issue, discussion and what replaced it. The code only lets the answer cite decisions Neo4j returned, and says "Not in the history" if none remain.

### 2. How do you know the graph, and not the model, does the work?
Every tool call and Cypher query, including ones the agent wrote, is shown under the answer. The answer may only cite decisions Neo4j returned, and the code refuses when none remain. Supersession and confidence come from graph edges and plain math. Turn Gemini off and fixed queries still answer, with no AI at all.

### 3. Why an agent and not fixed queries?
Some questions need several lookups in a row, or a shape our fixed tools do not cover. The agent plans those steps and writes its own Cypher for unusual questions. Its Cypher runs in a read transaction with a 5 second timeout, and the database rejects writes (we tested this). The code still controls citations, refusal and confidence.

### 4. What if the AI extraction is wrong?
Every decision must carry a quote that we find word for word in the PR text. If the quote is not there, we drop the decision. The AI can still mislabel why something was done, so we show the quote and link to the source PR for the user to check.

### 5. Can the AI still make things up when it writes the answer?
Citations are checked in code: only decisions that getDecisionChain returned from Neo4j count. If none remain, the code returns "Not in the history". The wording still comes from the model, so every claim links to a real PR, issue or commit for the reader to check.

### 6. Why Neo4j and not a vector database?
The questions are chains: this setting, changed by this PR, fixing this issue, written by this person, later replaced by that PR. That is a graph walk. A "replaced by" link is an edge, not a similarity score. We still use Neo4j's full-text search to find the starting point.

### 7. How do you detect that a decision was reversed?
Four ways: text like "supersedes", "replaces" or "reverts #N"; git revert commits (Futon has 3); a setting added by one PR and removed by a later one; and AI-spotted replacements that we check against the text. PR #146 replaced #112 without naming it. We caught it from the settings diff.

### 8. How do you calculate confidence?
Plain math over graph facts, not the model's opinion. +40 if matched by file, setting or PR number (+20 if by text only), +20 for a discussion or motivating issue, +20 if no later decision overrides it, +20 for two or more evidence records. Under 40, it refuses.

### 9. How does it handle renamed files or modules?
Today it does not do full entity resolution. Matching uses full-text search, so a rename can break the chain. [Team: say whether you plan to use git's rename detection, and label it as a plan.]

### 10. What if the reason was decided in Slack or a meeting?
Then it is not in the graph, and we say "not in the history" instead of guessing. That refusal is the point. Pulling in chat or design docs is future work, not built.

### 11. Docs drift. Doesn't PR history get stale too?
PR history does not drift. It records what was decided at a date. What goes stale is a decision that was later reversed, and that is what supersession marks.

### 12. How does it scale to a 10-year monorepo?
Loading the plain graph uses no AI. AI extraction runs once per merged PR at build time. Each question runs graph lookups, not a re-read of history. [Team: add measured time or cost per PR, or say it is not measured yet.] Today extraction covers merged PRs of one repo only.

### 13. What about private repos and security?
We read history through the GitHub API with a token. PR text goes to Gemini during extraction, and a company would need to approve that. We ran ArgosX twice: [first scan findings], fixed [what], second scan [result]. Remediation log: [link].

### 14. Who pays and why?
The engineering manager buys a team plan. The reason is faster onboarding, measured as time to first meaningful commit. Our price is a hypothesis: Rs 400 per developer per month. We have not tested willingness to pay.

### 15. What did you validate with real users?
[Team: 3 customer tests. For each: who, what they tried, what happened, one quote if they agreed to be quoted.] Customer adoption is untested.

### 16. Why will GitHub Copilot not just add this?
They might. Today Copilot chat, Cody, DeepWiki and Greptile explain what code does, and Swimm holds hand-written docs. Our focus is why, with a cited chain, reversed decisions struck through, and a refusal when the history is silent.

### 17. How big is the market?
Nasscom estimated 5.8 million employees in India's tech industry for FY2025 (https://www.nasscom.in/sites/default/files/media_pdf/Nasscom%20SR%20Press%20release.pdf). Our first users are new engineers at Indian startups with 10 to 100 engineers. We have not sized that slice yet.

### 18. Why Futon for the demo?
It is a public, active repo with real decisions: 71 PRs, 68 issues, 400 comments, 5,181 commits. It has a clear reversed decision (#112 to #146) and a bug-to-fix chain (#127 to #138). It is not our code, so we could not plant the answers.

### 19. What happens when a PR has no useful description?
The AI step finds no decision, so no Decision node is made. The plain graph still links files to PRs and their authors. [Confirm whether the UI shows the person to ask in that case.]

### 20. What if one PR only partly reverses an older one?
The current design marks the old decision as superseded as a whole. It does not model a partial reversal. We show both PRs in the timeline so the user can read the details.

### 21. What is honestly not done?
AI extraction covers merged PRs of one repo. Matching uses full-text search, not full entity resolution. Settings-diff supersession only reads Android preference files. Nobody outside the team has adopted it yet.
