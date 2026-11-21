# WhyGraph live demo script

Presenter: [Name]. Driver (types): [Name]. Live URL: [live URL].

## Before going on stage

- [ ] App open at [live URL], logged in, Futon data loaded.
- [ ] Neo4j AuraDB instance running. Neo4j Browser open in a second tab.
- [ ] Rehearsed all 3 questions below in the last hour. Wrote down the exact text that worked.
- [ ] Backup video at [link] and screenshots at [folder] open in a third tab.
- [ ] Phone hotspot ready in case venue Wi-Fi drops.
- [ ] Font size large enough to read from the back row.

Exact UI labels below are from the design. **Check them against the built app and fix this file before the demo.**

---

## Case 1: a decision chain

**Type:**
> Why are reading statistics kept when migrating to another source?

**Say while it loads:**
"We are asking about a real bug from Futon's history. The agent searches the graph with tools. Our code only lets it cite decisions Neo4j returns."

**The judge sees:**
- Answer that says reading statistics are kept on source migration, with citations.
- Evidence chain: Decision, from PR #138 "fix: Keep reading statistics when migrating to another source", by PoonHarpoon.
- Motivated by: Issue #127 "migrating to alternative source resets statistics", by BlueStarOne.
- Person to ask: PoonHarpoon. PR #138 merged 6 Nov 2026. Issue #127 date: [read from screen].
- Confidence: [read from screen].
- Under the answer: every tool call and Cypher query the agent ran.

**Point at and say:**
"A user reported their reading time reset after switching source. That is issue 127. PR 138 fixed it. The graph links the two with a FIXES edge. Click here and it opens the real PR on GitHub."

Links: https://github.com/AppFuton/Futon/issues/127 , https://github.com/AppFuton/Futon/pull/138

---

## Case 2: a reversed decision (supersession)

**Type:**
> Does smart resume wait for chapter updates?

Backup wording if search misses: "Why was the Wait for chapter updates setting removed?"

**Say while it loads:**
"This is the case search tools get wrong. The archive has two answers, and only one is still true."

**The judge sees:**
- Current answer from PR #146 by PoonHarpoon, merged 19 Nov 2026: waiting is now the default, the setting is dropped, and a chapter update timeout is added.
- Timeline: PR #112 (merged 19 Sep 2026, opt-in smart resume with a default-off setting) struck through, marked superseded by #146.
- Reason for supersession: setting `reader_smart_resume_wait` in `app/src/main/res/xml/pref_reader.xml` was added in #112 and removed in #146.

**Point at and say:**
"PR 146 never mentions 112. We found the link from the code change itself: one PR added this setting, a later one deleted it. A plain search would quote 112 as if it were still the rule."

Links: https://github.com/AppFuton/Futon/pull/112 , https://github.com/AppFuton/Futon/pull/146

---

## Case 3: honest refusal

**Type:**
> Why does Futon use Kubernetes for billing?

**Say while it loads:**
"Futon is a reading app. It has no billing and no Kubernetes. Let us see if the system makes something up."

**The judge sees:**
- "Not in the history". No citations. No invented reason.
- Under the answer: the agent's searches, each with no matching decision.

**Do:** open the "Show how the agent searched the graph" panel. Point at each query and its empty result.

**Say:**
"The agent did search. Here are its queries, and every one came back with no matching decision. Our code only lets an answer cite decisions Neo4j returned. None came back, so the code refused, not the model. The model cannot talk its way past that."

---

## If something fails

| What failed | What to do | What to say |
|---|---|---|
| AI (Gemini) down or no key set | Run the 3 cases as normal. The app falls back to fixed Cypher queries with no AI. [Confirm what the UI shows in this mode.] | "The AI is off right now. These answers come from fixed graph queries alone." |
| App down, Neo4j up | Switch to Neo4j Browser. Run the saved queries [team: paste the exact Cypher templates from the app here]. Show PR #112, PR #146 and the SUPERSEDES edge between them. | "This is the same query the app runs. The answer lives in the graph." |
| Network down | Play the backup video [link], or click through screenshots [folder]. | "Here is the same run, recorded at [time]. Same data, same queries." |
| Wrong answer on a rehearsed case | Do not defend it. Open the evidence and show where it went wrong. | "That is wrong. Here is the evidence it used, so you can see why." |

---

## Three extra questions a judge may type

Rehearse each. Write what actually happens in the [result] slots.

1. **"Who should I ask about the reader settings?"**
   Expect: people linked to reader decisions, such as PoonHarpoon. [result]

2. **"Why does the reader have a chapter update timeout?"**
   Expect: PR #146. Good follow-up to case 2. [result]

3. **"Why was Futon forked from Kotatsu?"**
   Expect: likely not in the PR and issue history, so a refusal. A refusal here is correct. [result]

## When a judge's own question gets a wrong or empty answer

- **Empty answer:** "Nothing in the graph matches, so it refused instead of guessing. Matching uses full-text search today, so wording matters. Let me try the words the PR used." Rephrase once. If it still refuses, stop and move on.
- **Wrong answer:** "That is wrong. Here are the PRs it used." Open the "Show how the agent searched the graph" panel. Explain which step or link is weak. Do not retry until it looks right.
- **Answer exists but outside our slice:** "AI extraction covers merged PRs of this one repo for the demo. If the reason sits only in a commit or a chat, we do not have it yet."
