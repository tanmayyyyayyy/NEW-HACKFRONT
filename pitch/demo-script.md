# SkillForge Live Demo Script

Presenter: Tanmay. Live app: `http://localhost:3002` (or hosted production URL).

## Before Going on Stage Checklist

- [x] App open at `http://localhost:3002`, bundled Futon data ready.
- [x] Neo4j instance running (`bolt://127.0.0.1:17687` or AuraDB instance).
- [x] Rehearsed all 3 cases below. Both `npm run check:chat` and `npm run check:ui` passing.
- [x] Tested on desktop (1280px) and mobile viewport (390px). Zero horizontal overflow.
- [x] Phone hotspot on standby for backup venue connectivity.

---

## The 3 Demo Cases

### Case 1: Decision Chain (Issue ➔ PR ➔ Diff ➔ Author)

**Click or Type:**
> *“Why preserve reading statistics during source migration? Trace issue #127 and PR #138.”*
*(Or click the preset: **Trace the migration fix**)*

**What to Say:**
> *"Every team has code that looks strange until you know the bug that forced it. Watch SkillForge walk the Neo4j graph to find the exact reason."*

**What the Judges See:**
- **Decision Chain**: Motivated by **Issue #127** (*"migrating to alternative source resets statistics"* by `@BlueStarOne`), resolved in **Merged PR #138** (*"fix: Keep reading statistics when migrating to another source"* by `@PoonHarpoon`, merged 06 Nov 2026).
- **Changed Files**: `ReadingStats.kt`, `SourceManager.kt` with a direct link to the GitHub diff.
- **Action**: Click **Download cited trail** or **Copy handover note** to export the verified evidence.
- **Proof**: Open **View executed Cypher** to reveal the exact parameterized Cypher query that retrieved the nodes.

---

### Case 2: Reversed Decision (Supersession / Override Detection)

**Click or Type:**
> *“Why did PR #146 replace the chapter update behavior from PR #112?”*
*(Or click the preset: **Compare two decisions**)*

**What to Say:**
> *"This is where ChatGPT, Copilot, and vector RAG get completely tricked. Traditional search pulls PR 112 and tells you the setting is default-off. But that decision was reversed."*

**What the Judges See:**
- **Decision Changed Card**: PR #112 (*"An opt-in setting"* merged 19 Sep 2026) is visually struck through, replaced by PR #146 (*"A new default"* merged 19 Nov 2026).
- **The Graph Magic**: PR #146 never mentions #112 in its description! SkillForge caught the supersession directly from the preference XML diff (`reader_smart_resume_wait` removed and enabled by default).
- **Follow-up Chat**: Click **Authors and dates** or type *"Who recorded these changes and when?"* to see `@PoonHarpoon` and the exact chronological timestamps.

---

### Case 3: Honest Refusal (Zero Hallucination)

**Click or Type:**
> *“Why does Futon use Kubernetes for billing?”*
*(Or click the preset: **Try an unanswered question**)*

**What to Say:**
> *"Futon is an Android reader app. It has zero Kubernetes and zero billing. LLMs love to hallucinate a fake microservices billing architecture. Watch what our code does."*

**What the Judges See:**
- **Response**: *"The indexed history could not establish an answer."*
- **Evidence Count**: 0 records. Zero fake citations.
- **Cypher Drawer**: Shows the query executed with score thresholding, found no matches, and safely refused.

---

## Three Extra Questions a Judge May Ask

1. **"Who should I ask about reader settings?"**
   - Click follow-up: returns `@PoonHarpoon`, PR #112 and PR #146 author.
2. **"Can I connect my team's private repository?"**
   - Navigate to `/account?path=private`, demonstrate entering a scoped GitHub personal access token and explain that tokens stay exclusively in browser tab memory and are re-verified on every query.
3. **"Can it explain in Hindi or Hinglish?"**
   - Check the **Let Sarvam explain the answer** box, select **Hinglish**, and run the question. Sarvam AI synthesizes the exact Neo4j records into conversational Hinglish.
