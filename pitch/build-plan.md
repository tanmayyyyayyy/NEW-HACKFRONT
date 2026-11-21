# Finale Build Plan: WhyGraph

[Team name] | [Name], [Name], [Name] | hackFront India Grand Finale, IIIT Delhi, 21-22 Nov 2026

**What it is:** WhyGraph answers "why is the code like this?" from a repo's own history. It returns a chain of evidence: the decision, the discussion, the person to ask and the date. It refuses when the history has no answer.

## 1. Where we are now ([time], 21 Nov)

| Part | Status |
|---|---|
| GitHub history collected for AppFuton/Futon: 71 PRs, 68 issues, 400 comments, 5,181 commits | Done |
| Three demo cases checked by hand against GitHub (decision chain, supersession, refusal) | Done |
| Plain graph in Neo4j (Person, PR, Issue, Commit, File, ConfigKey) | [Done / In progress] |
| AI extraction of decisions with word-for-word quote check | [Done / In progress] |
| Supersession detection (explicit text, git reverts, setting added then removed) | [Done / In progress] |
| Question answering (Gemini agent with graph tools; code decides what it may cite, or refuses) | [Done / In progress] |
| UI: evidence chain, every tool call and Cypher query shown, timeline, person to ask, links | [Done / In progress] |
| Deployed (Vercel + Neo4j AuraDB) | [Not started / Done: live URL] |

## 2. Where we will be by 12 PM, 22 Nov

A deployed app where a judge can ask about Futon and get:

| Demo question | Expected behaviour |
|---|---|
| Why does migrating a manga keep its reading statistics? | Chain: Issue #127 (BlueStarOne) -> PR #138 (PoonHarpoon, merged 6 Nov 2026) -> files changed -> person to ask, with dates and links |
| Is "Wait for chapter updates" a setting I can turn on? | Shows PR #112 (merged 19 Sep 2026) struck through as superseded by PR #146 (merged 19 Nov 2026), which made waiting the default and dropped the setting. Found from the code diff; #146 never mentions #112 |
| Why does Futon use Kubernetes for billing? | The agent searches, its queries return no matching decision, and the code refuses: "Not in the history." |

Under every answer the screen shows each tool call and every Cypher query that ran, including the ones the agent wrote. Confidence is plain math over graph facts, not the model's opinion: +40 matched by file, setting or PR number (+20 if by text only), +20 discussion or motivating issue, +20 not overridden, +20 two or more evidence records. Under 40, it refuses. Both ArgosX scans done and the remediation log filled. Three customer tests done and logged.

## 3. User segments

| Segment | Their problem |
|---|---|
| **Primary:** new engineer at an Indian product startup (10-100 engineers) | Can read the code, cannot find the reasons behind it |
| Engineering manager or tech lead | People leave, and the reasons leave with them. Handover is slow |
| Open-source contributor or student | Needs to know if a change is safe before sending a PR |

## 4. Partner tech: Neo4j

**The product need:** a "why" answer is a path, not a paragraph. Decision -> PR -> discussion -> person -> issue that caused it -> later decision that replaced it. That is a graph walk.

| Need | How Neo4j meets it |
|---|---|
| Follow links across many hops | getDecisionChain walks decision, PR, person, issue, discussion and supersession in one query |
| Know when a decision is out of date | SUPERSEDES edges between Decision nodes |
| Prove the graph does the work, not the model | The answer may only cite decisions that getDecisionChain returned from Neo4j. If none remain, the code returns "Not in the history". Every tool call and query is shown |
| Answer questions the fixed tools cannot express | runCypher: the agent writes a read-only query. It runs in a read transaction with a 5 s timeout, and the database rejects writes (verified) |
| Keep working without the AI | If Gemini is down or no key is set, fixed Cypher queries answer with no AI |
| Find where to start | searchDecisions (Neo4j full-text index), findDecisionsByFileOrSetting, findDecisionsByNumber |

Neo4j is in the core flow: every answer starts with a graph query.

## 5. Definition of done

A judge can open the live URL, ask the three demo questions, and get a cited evidence chain, a supersession marked on a timeline, and an honest refusal, each with the tool calls and Cypher that produced it.

## Honest limits

- AI extraction covers merged PRs of one repo for the demo.
- Matching a question to code uses full-text search and exact file, setting or PR number lookups, not full entity resolution.
- Setting-diff supersession reads Android preference files only.
- Customer adoption is untested.
