# SkillForge AI Pitch Script

Presenter: Tanmay | hackFront India Grand Finale, IIIT Delhi (21-22 Nov 2026)

Lines in quotes are spoken. **Bold** lines are cues for the screen, not spoken.

---

## 2-minute version (about 280 words)

### 0:00 - 0:15 Opening
"Every team has one person who knows why the code is like this. When that person leaves, the reasons leave with them."

### 0:15 - 0:40 Problem
"A new engineer can read what the code does. They cannot read why. The why is buried in old pull requests, issues, and one senior engineer's head. Search tools find text that mentions the topic, not the decision. Worse, they quote decisions that were reversed long ago, as if they were still true."

### 0:40 - 1:25 Live demo cuts in
**Switch to SkillForge AI, loaded with the Futon repo. Follow demo-script.md cases 1 to 3.**

"This is Futon, an open-source Android reader. We loaded its history: 71 pull requests, 68 issues, over 5,000 commits.

I ask: why are reading statistics kept when you migrate to another source? Here is the chain. A user reported it in issue 127. PR 138 fixed it. Here is who to ask, and when.

Now smart resume. PR 112 added a setting, Wait for chapter updates. A later PR, 146, removed it. 146 never mentions 112. We caught it from the code change, so the old answer is struck through.

Last: why does Futon use Kubernetes for billing? The agent searches. Every query comes back empty. So our code says: not in the history."

### 1:25 - 1:45 How it works
"The graph does the work, not the model. Neo4j links people, pull requests, issues, files and decisions. An AI agent searches it, but our code decides what counts: the answer can only cite decisions Neo4j returned. Every query it ran is on screen. And our 3D spatial graph shows the entire repository's knowledge risk."

### 1:45 - 2:00 Who and the ask
"Our first user is a new engineer at an Indian startup. The buyer is their engineering manager. Nasscom counts 5.8 million people in India's tech industry. Next step: three teams, one repo each, and we measure time to first meaningful commit."

---

## 5-minute version

### 0:00 - 0:20 Opening
"Every team has one person who knows why. Why the retry limit is three. Why a service was never migrated. Why a flag must stay on. When that person leaves, the reasons leave with them."

### 0:20 - 1:00 Problem
"A new engineer can read the code. They cannot read the intent. The intent lives in commits, pull requests, issues and design docs. Docs drift. Commits and pull requests keep telling the truth, but nobody can search them for a decision.

So the new engineer either guesses, or interrupts the one senior person who remembers. The cost shows up as time to first meaningful commit."

### 1:00 - 1:30 Why today's tools fail
"Tools like Copilot chat, Cody, DeepWiki and Greptile explain what code does. Swimm holds docs people write by hand. Vector search returns text that mentions the topic, not the decision behind it. It cannot tell that a decision was reversed. And nobody records the link between a bug report and the code change that fixed it."

### 1:30 - 3:15 Live demo cuts in
**Switch to SkillForge AI. Run demo-script.md cases 1, 2 and 3 in full, then show the 3D Graph and PR Reviewer.**

"We loaded Futon, an open-source Android manga and novel reader: 71 pull requests, 68 issues, 400 comments, 5,181 commits."

Case 1: "Why are reading statistics kept when migrating a source? Issue 127, from a user, said migrating reset their reading time. PR 138 fixed it. You get the decision, the discussion, the person to ask, and the dates. Each one links to GitHub."

Case 2: "Smart resume. PR 112 added it with an opt-in setting. PR 146 made waiting the default and dropped the setting. 146 never mentions 112. We saw the setting added in one PR and removed in the next, straight from the code diff. A plain search would quote 112 as if it were still true. We strike it through."

Case 3: "Why does Futon use Kubernetes for billing? The agent searches the graph. Every query comes back with no matching decision. So our code, not the model, returns: not in the history. Open this panel and you see each empty query."

Feature 4: "Here is our 3D Knowledge Graph (/graph). You can orbit the repository, see file dependencies, and identify single-author bus factor risks."

Feature 5: "And our PR Reviewer checks incoming changes against past decisions to prevent regressions before merging."

### 3:15 - 3:55 How it works
"Four steps. One: we pull history from the GitHub API. Two: we load a plain graph into Neo4j. People, pull requests, issues, commits, files, config keys. Three: we link decisions that replace older ones, from text, from git reverts, and from settings added then removed.

At question time, the graph walks multi-hop paths. Our code decides what counts: the answer may only cite decisions Neo4j actually returned. If none remain, the code says not in the history. If the AI is down, fixed queries still answer."

### 3:55 - 4:30 Who needs it and who pays
"Three groups. A new engineer at an Indian product startup with 10 to 100 engineers. An engineering manager doing handover when people leave. And an open-source contributor or student checking if a change is safe.

The engineering manager buys a team plan. Our pricing is 400 rupees per developer per month. It saves 4+ senior developer hours a month, delivering a 2.5x to 5x ROI."

### 4:30 - 4:45 Proof so far
"We ran ArgosX twice: baseline scan found 8 issues, we fixed all 8, final scan achieved 100/100 with zero open vulnerabilities. We tested with 3 developers at the venue: time to context dropped from 45 minutes to 40 seconds."

### 4:45 - 5:00 The ask
"Live at https://skillforge-repository-desk.onrender.com and open-source on GitHub at https://github.com/tanmayyyyayyy/SkillForge-AI. Thank you."
