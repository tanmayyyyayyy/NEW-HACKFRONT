# The problem, in plain English

## What is wrong today

Every software team has one person who knows **why** the code is the way it is. Why the retry limit is three. Why a service was never moved. Why a setting must stay on.

That knowledge sits in old commits, pull requests, issues, design docs, and that person's head. When they leave, it leaves with them.

A new engineer can read what the code does. They cannot read why. So they guess, or they keep asking the one senior person.

Current tools do not fix this:

- **Search finds words, not decisions.** It returns text that mentions the topic, not the choice that was made.
- **Docs drift.** Commits and pull requests keep telling the truth, but nobody reads them.
- **Old decisions look current.** A reversed decision still sits in the archive and reads like the rule.
- **Bug-to-fix links are lost.** Nobody records which incident led to which code change.

The business cost: a slow **time to first meaningful commit** for every new engineer.

## What WhyGraph does

You ask a question in plain English. WhyGraph answers with a chain of evidence: the decision, the discussion, the person to ask, and the date. It strikes through decisions that were later reversed. It shows how sure it is. When the history has no answer, it says so.

Demo repo: AppFuton/Futon (https://github.com/AppFuton/Futon), an open-source Android manga and novel reader. 71 PRs, 68 issues, 400 comments, 5,181 commits.

---

## T1.1 requirements

| Requirement | How WhyGraph meets it | Show on screen |
|---|---|---|
| Ingest a public repo's history | GitHub REST API pulls PRs, issues, comments and commits into JSON | Data counts for Futon: 71 PRs, 68 issues, 400 comments, 5,181 commits |
| Graph linking code to decisions, people, incidents | Neo4j: Person, PR, Issue, Commit, File, ConfigKey, Decision. Edges AUTHORED, TOUCHES, MERGED_AS, FIXES, DECIDED_IN, DECIDED_BY, AFFECTS, MOTIVATED_BY. Issues stand in for incidents | Graph view around PR #138 and Issue #127 |
| Natural-language answers with a chain of evidence | A Gemini agent uses tools: searchDecisions (full-text), findDecisionsByFileOrSetting, findDecisionsByNumber, getDecisionChain (PR, person, issue, discussion, supersedes and superseded-by), and runCypher (a read-only query it writes itself, only when the fixed tools cannot express the question). The answer may only cite decisions Neo4j returned | Case 1: Issue #127 to PR #138, person to ask, dates, GitHub links, every tool call under the answer |
| Detect supersession | SUPERSEDES edges from "supersedes/replaces/reverts #N" text, git revert commits, settings added then removed, and AI-found replacements checked against the text | Case 2: #112 struck through, replaced by #146, found from the `reader_smart_resume_wait` diff |
| Show confidence | Plain math over graph facts: +40 matched by file, setting or number (+20 if by text only), +20 discussion or motivating issue, +20 not overridden, +20 two or more evidence records. Under 40, it refuses | Confidence value on each answer |
| Refuse when the graph has no answer | The code keeps only decisions getDecisionChain returned from Neo4j. If none remain, the code returns "Not in the history" | Case 3: "Why does Futon use Kubernetes for billing?" gives "Not in the history", with the empty queries shown |

## What T1.1 judges reward

| Reward | How WhyGraph meets it | Show on screen |
|---|---|---|
| A question the docs could not answer | Case 2: the current smart resume rule and the fact that #146 replaced #112. [Verify Futon's README and docs do not explain this before claiming it] | Timeline with #112 struck through |
| Honest behaviour when the answer is not there | The code, not the model, decides what counts and when to refuse | Case 3, "Show how the agent searched the graph" panel with empty results |
| Evidence that the graph, not the model, does the work | Every tool call and Cypher query is shown, including ones the agent wrote. Citations limited to decisions Neo4j returned. Decision quotes checked word for word against source. Supersession and confidence come from the graph. With Gemini off, fixed queries still answer | "Show how the agent searched the graph" panel, quote next to each decision |
| Commercial wedge: time to first meaningful commit | New engineer gets the why without waiting on a senior engineer | Pitch slide on onboarding [plus test results if any] |

## Hackathon judging criteria

| Criterion | How WhyGraph meets it | Show on screen |
|---|---|---|
| Build and Complete (most weight) | Working end-to-end flow: collect, graph, extract, supersede, answer, refuse | All 3 demo cases live at [live URL] |
| Integrate and Innovate (Neo4j in core flow) | Neo4j holds the graph and answers every agent tool call, full-text search and Cypher query. Without Neo4j there is no answer | Cypher panel, Neo4j Browser graph view |
| Secure (ArgosX twice + remediation log) | [First scan result], [fixes], [second scan result] | ArgosX reports and remediation log [link] |
| Validate Market (Market Fit Canvas + 3 customer tests) | [Market Fit Canvas link]. [3 test results]. Pricing hypothesis: Rs 400 per developer per month, bought by the engineering manager | Canvas and test notes |
| Expand Impact (3+ segments, Persona Use Case Matrix) | New engineer at an Indian startup (10 to 100 engineers). Engineering manager or tech lead doing handover. Open-source contributor or student checking if a change is safe. [Persona Use Case Matrix link] | Persona Use Case Matrix |

## Final objective

| Question | Short answer |
|---|---|
| Why does it need to exist? | The reasons behind code leave when people leave. Search tools miss decisions and quote reversed ones as current. |
| Who needs it? | New engineers, engineering managers handling handover, open-source contributors. Nasscom estimated 5.8 million employees in India's tech industry for FY2025 (https://www.nasscom.in/sites/default/files/media_pdf/Nasscom%20SR%20Press%20release.pdf). |
| How does it work? | GitHub history into a Neo4j graph. AI extracts decisions once, with quotes checked against the source. A Gemini agent searches the graph with tools. Code allows only citations Neo4j returned, computes confidence, and refuses when nothing remains. |
| How can it scale? | Loading the graph needs no AI. Extraction runs once per merged PR. Questions run graph lookups, not a re-read of history. With no AI key, fixed queries still answer. [Add measured cost or time per PR.] |

## Honest limits

- AI extraction covers merged PRs of one repo for the demo.
- Matching uses full-text search, not full entity resolution.
- Settings-diff supersession only understands Android preference files.
- Customer adoption is untested.
