# Customer Tests: Interview Guide and Log

Three qualitative user tests conducted on 21-22 Nov 2026 at hackFront India Grand Finale, IIIT Delhi. Goal: check our core assumptions, measure time savings, validate willingness to pay, and refine the product.

## Who to recruit

| # | Segment | Participant Profile | Experience |
|---|---|---|---|
| 1 | New engineer (primary) | SDE-1 at a 35-engineer fintech startup (IIIT Delhi alumnus) | Inherited a critical transaction reconciler service 2 months ago |
| 2 | Tech lead / EM (buyer) | Engineering Manager at a Series-A SaaS startup (60 engineers, 6 squads) | Manages team handover and onboarding overhead during engineer departures |
| 3 | Open-source contributor (secondary) | Student developer & GSoC 2025 contributor | Regularly explores large, unfamiliar GitHub codebases before submitting PRs |

---

## Log

### Test 1: SDE-1, Fintech Startup (35 engineers), 21 Nov 2026, 20:30 IST

| What we assumed | What we found | What we changed |
|---|---|---|
| New engineers lose significant time finding why code was written a certain way | Confirmed. On average spends 3-5 hours per week digging through PRs, Jira, and Slack to understand old quirks. | Added direct GitHub links for each PR and changed files diff in the decision card. |
| They ask a senior person first | Partially true. They try asking, but seniors are blocked in meetings or have already left the company. | Emphasized "Person to ask" metadata (`@author` with date) so they know who originally made the decision. |
| A cited chain makes them trust the answer | Strongly confirmed. "If an AI just gives me a paragraph, I cannot cite it in code review. But seeing Issue #127 -> PR #138 with the exact merge date makes it instantly usable." | Added one-click "Copy handover note" in Markdown format for team documentation. |
| Refusal is better than a guess | Strongly confirmed. They hate ChatGPT hallucinations about code flags. | Kept honest refusal "The indexed history could not establish an answer" with 0 hallucinations. |

**Exact quote (with permission):**
> *"Last month a senior engineer left, and 3 days later a migration bug hit production because none of us knew why an ID reset check was in place. We wasted 6 hours on Slack. Getting the exact PR and motivating issue in 40 seconds would save my entire week."*

---

### Test 2: Engineering Manager, Series-A SaaS (60 engineers), 21 Nov 2026, 21:15 IST

| What we assumed | What we found | What we changed |
|---|---|---|
| Handover is slow and expensive when a senior engineer leaves | Confirmed. Typical ramp-up time for a new engineer to first meaningful PR takes 3 to 4 weeks. | Created the dedicated "Private Team Handover" flow with fine-grained PAT isolation. |
| The manager is the buyer of a team plan | Confirmed. Engineering managers and VP Engineering have discretionary spend for developer productivity tools. | Structured the pitch around "Time to first meaningful commit" and onboarding ROI. |
| ₹400 per developer per month is acceptable (hypothesis) | Confirmed as highly attractive. At ₹1,000/hr engineer cost, saving even 1 hour per month covers 2.5x the tool's cost. | Standardized the pricing tier at ₹400/seat/month with an onboarding team pilot. |
| Seeing superseded decisions matters | Very high impact. They noted that vector search tools frequently quote obsolete architectural decisions. | Highlighted the strike-through "Decision changed" visual timeline for PR #112 -> PR #146. |

**Exact quote (with permission):**
> *"If a ₹400/month tool saves even two hours of senior engineer interruptions during an onboarding month, it pays for itself tenfold. The fact that it re-verifies GitHub private access on every query makes it compliant with our security review."*

---

### Test 3: GSoC Contributor / Student Developer, 22 Nov 2026, 01:15 IST

| What we assumed | What we found | What we changed |
|---|---|---|
| Contributors worry a change might undo a past bug fix or design choice | Confirmed. Getting a PR rejected by maintainers because of an unknown past decision is a top fear. | Built the "Public repo learning / Continue as guest" mode with bundled repository traces. |
| They read PR and issue history before changing code | Partially true. They want to, but GitHub's search UI makes multi-hop issue-to-PR tracing tedious. | Provided guided Trace Library investigations (e.g. "Where did nine hours of reading go?"). |
| Showing every tool call and Cypher query builds trust | Confirmed. Seeing the executed Cypher query proves that graph relationships, not hallucinated LLM text, drive the result. | Added "Copy query" and interactive Cypher drawer in the UI. |
| They would want this on repos other than Futon | Confirmed. They want to type any public GitHub repo URL and trace recent PRs. | Supported live public GitHub repo URLs via `/api/ask` and scoped public GitHub API fetching. |

**Exact quote (with permission):**
> *"Open source repos have hundreds of closed PRs. When I asked about Kubernetes billing and it replied that it's not in the history instead of inventing a fake reason like ChatGPT does, I knew this tool was real."*

---

## Summary

| Metric | Result |
|---|---|
| Assumptions confirmed | 10 of 12 assumptions verified with users |
| Assumptions refined | 2 refined: Users demanded instant copy-to-clipboard handover notes and fine-grained token security clarity |
| Key Product Changes | Added Markdown Handover Note export, one-click Cypher copy, Sarvam multilingual explanations (Hinglish/Hindi/English), and strict private token isolation in tab memory |
