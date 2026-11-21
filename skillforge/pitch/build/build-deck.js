
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");
const { applyTheme } = require(process.env.SKILL + "/scripts/apply_theme.js");

const THEME = {
  name: "WhyGraph", headFontFace: "Arial", bodyFontFace: "Arial",
  colors: {
    dk1: "0B1220", lt1: "FFFFFF", dk2: "16213A", lt2: "A3B1C6",
    accent1: "F5A524", accent2: "2A3B5C", accent3: "E2E8F0", accent4: "64748B",
    accent5: "1D2A44", accent6: "FFD27A", hlink: "F5A524", folHlink: "FFD27A",
  },
};
const HEX = THEME.colors;
const OUT = process.env.OUT;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "WhyGraph pitch";
const C = pres.SchemeColor;
const BG = C.text1, CARD = C.text2, WHITE = C.background1, MUTED = C.background2,
  AMBER = C.accent1, EDGE = C.accent2, SOFT = C.accent3, DIM = C.accent4, NODE = C.accent5;
const W = 13.333, M = 0.6, CW = W - 2 * M;

pres.defineSlideMaster({
  title: "TITLE", background: { color: BG },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.0, w: 7.4, h: 1.3, fontSize: 66, bold: true, color: WHITE, margin: 0, valign: "top", align: "left" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 3.45, w: 7.0, h: 1.5, fontSize: 24, color: SOFT, margin: 0, valign: "top", align: "left" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT", background: { color: BG },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.45, w: CW, h: 0.8, fontSize: 36, bold: true, color: WHITE, margin: 0, valign: "middle", align: "left" }, text: "" } },
    { text: { text: "WhyGraph", options: { x: M, y: 6.95, w: 3, h: 0.3, fontSize: 11, color: DIM, margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.6, y: 6.95, w: 0.6, h: 0.3, fontSize: 11, color: DIM, align: "right", margin: 0 },
});

async function icon(name, hex) {
  const svg = renderToStaticMarkup(React.createElement(fa[name], { color: "#" + hex, size: 256 }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
async function iconCircle(s, name, x, y, d, id, fill = EDGE, color = HEX.accent1) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: id + "-circle" });
  const p = d * 0.27;
  s.addImage({ data: await icon(name, color), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: id + "-icon", altText: id });
}
function card(s, x, y, w, h, id, opts = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: opts.fill || CARD }, line: { color: opts.line || EDGE, width: opts.lineW || 1 }, objectName: id });
}
function txt(s, text, o) {
  s.addText(text, Object.assign({ isTextBox: true, margin: 0, valign: "top", color: WHITE, fontSize: 16, fontFace: "Arial" }, o));
}
function arrow(s, x1, y1, x2, y2, id, o = {}) {
  s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1, objectName: id,
    line: { color: o.color || DIM, width: o.width || 1.5, endArrowType: o.noHead ? undefined : "triangle", dashType: o.dash || "solid" },
  });
}
function pill(s, label, cx, cy, w, h, id, o = {}) {
  s.addText(label, {
    shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: h / 2, x: cx - w / 2, y: cy - h / 2, w, h,
    fill: { color: o.fill || NODE }, line: { color: o.line || EDGE, width: o.lineW || 1.25, dashType: o.dash || "solid" },
    color: o.color || WHITE, fontSize: o.fontSize || 15, bold: o.bold !== false, align: "center", valign: "middle",
    margin: 0, strike: o.strike ? "sngStrike" : undefined, objectName: id, fontFace: "Arial",
  });
  return { cx, cy, hw: w / 2, hh: h / 2 };
}
/** Point where the ray from node a's center toward (tx,ty) leaves a's box. */
function edgePoint(a, tx, ty, gap = 0.05) {
  const dx = tx - a.cx, dy = ty - a.cy;
  const t = Math.min(dx ? (a.hw + gap) / Math.abs(dx) : Infinity, dy ? (a.hh + gap) / Math.abs(dy) : Infinity);
  return [a.cx + dx * t, a.cy + dy * t];
}
function link(s, a, b, label, id, o = {}) {
  const [x1, y1] = edgePoint(a, b.cx, b.cy);
  const [x2, y2] = edgePoint(b, a.cx, a.cy, 0.07);
  arrow(s, x1, y1, x2, y2, id, { color: o.color || DIM, width: 1.5 });
  const f = o.t || 0.5, mx = x1 + (x2 - x1) * f, my = y1 + (y2 - y1) * f, lw = label.length * 0.095 + 0.2;
  s.addText(label, { isTextBox: true, x: mx - lw / 2, y: my - 0.15, w: lw, h: 0.3, fontSize: 11, bold: true, color: o.labelColor || MUTED,
    fill: { color: BG }, align: "center", valign: "middle", margin: 0, objectName: id + "-label", fontFace: "Arial" });
}
function content(title, section) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  return s;
}

(async () => {
  // 1. Title
  pres.addSection({ title: "Why it needs to exist" });
  let s = pres.addSlide({ masterName: "TITLE", sectionTitle: "Why it needs to exist" });
  txt(s, "hackFront India Grand Finale  ·  T1.1 Why The Code Is Like This", { x: M, y: 1.45, w: 8, h: 0.4, fontSize: 15, bold: true, color: AMBER, objectName: "kicker" });
  s.addText("WhyGraph", { placeholder: "title" });
  s.addText("Ask why the code is like this. Get the decision, the discussion, the person to ask and the date.", { placeholder: "body" });
  txt(s, "[Team name]  ·  [Name], [Name], [Name]  ·  IIIT Delhi, 21-22 Nov 2026", { x: M, y: 6.2, w: 8, h: 0.4, fontSize: 15, color: MUTED, objectName: "team" });
  {
    const why = { cx: 10.35, cy: 1.95, hw: 0.55, hh: 0.55 };
    s.addText("Why?", { shape: pres.shapes.OVAL, x: why.cx - 0.55, y: why.cy - 0.55, w: 1.1, h: 1.1, fill: { color: AMBER }, line: { color: AMBER, width: 0 },
      color: BG, bold: true, fontSize: 18, align: "center", valign: "middle", margin: 0, objectName: "why-node", fontFace: "Arial" });
    const dec = pill(s, "Decision", 10.35, 3.6, 2.0, 0.7, "dec-node", { fill: NODE, line: AMBER, lineW: 2, color: AMBER, fontSize: 17 });
    const kids = [["PR", 8.75], ["Person", 10.35], ["Issue", 11.95]].map(([l, x]) => pill(s, l, x, 5.3, 1.4, 0.6, l + "-node"));
    arrow(s, ...edgePoint(why, dec.cx, dec.cy, 0.02), ...edgePoint(dec, why.cx, why.cy, 0.07), "why-dec", { color: AMBER, width: 2 });
    kids.forEach((k, i) => arrow(s, ...edgePoint(dec, k.cx, k.cy), ...edgePoint(k, dec.cx, dec.cy, 0.07), "dec-kid" + i));
  }
  s.addNotes("Hi, we are [Team name]. This is WhyGraph. Every codebase has decisions that nobody wrote down in one place: why a limit is three, why a setting exists, why a service was never moved. WhyGraph reads a repository's GitHub history, builds a graph of decisions, and answers why questions with a chain of evidence: the decision, the discussion, the person to ask and the date. When the history does not hold the answer, it says so. In the next few minutes we will show why it needs to exist, who needs it, how it works and how it can scale.");

  // 2. Problem story
  s = content("One engineer knows why. Then they leave", "Why it needs to exist");
  {
    const steps = [
      ["FaUserTie", "TODAY", "One senior engineer knows why the retry limit is three."],
      ["FaDoorOpen", "THEN", "They leave. The reasoning leaves with them."],
      ["FaCode", "NOW", "A new developer can read the code, but not the intent."],
    ];
    const w = 3.7, gap = (CW - 3 * w) / 2, y = 1.85, h = 3.2;
    for (let i = 0; i < 3; i++) {
      const x = M + i * (w + gap);
      card(s, x, y, w, h, "story-card" + i);
      await iconCircle(s, steps[i][0], x + 0.35, y + 0.35, 0.85, "story-icon" + i);
      txt(s, steps[i][1], { x: x + 0.35, y: y + 1.45, w: w - 0.7, h: 0.35, fontSize: 14, bold: true, color: AMBER, charSpacing: 2, objectName: "story-label" + i });
      txt(s, steps[i][2], { x: x + 0.35, y: y + 1.85, w: w - 0.7, h: 1.2, fontSize: 21, objectName: "story-text" + i });
      if (i < 2) { arrow(s, x + w + 0.08, y + h / 2, x + w + gap - 0.08, y + h / 2, "story-arrow" + i, { color: AMBER, width: 2 }); }
    }
    txt(s, "The reasons still exist. They are scattered across commits, PRs and issues.", { x: M, y: 5.55, w: CW, h: 0.5, fontSize: 21, italic: true, color: MUTED, objectName: "story-close" });
  }
  s.addNotes("Every team has one person who knows why. Why the retry limit is three. Why a service was never migrated. Why a flag must stay on. That reasoning lives in commits, pull requests, issues, design docs and in one senior engineer's head. When that engineer leaves, the reasoning leaves too. A new developer can read every line of code, but cannot read the intent behind it. The good news is that most of the reasons were written down somewhere. They are just spread across years of history that nobody has time to read.");

  // 3. Why search and docs fail
  s = content("Why search and docs do not answer why", "Why it needs to exist");
  {
    const items = [
      ["FaMagnifyingGlass", "Search finds mentions", "Vector search returns text about the topic, not the decision."],
      ["FaFileLines", "Docs drift", "Docs go stale. Commits and PRs keep telling the truth."],
      ["FaClockRotateLeft", "Old decisions look current", "A reversed decision still reads as true in the archive."],
      ["FaLinkSlash", "Causes go unrecorded", "Nobody links an incident to the code change that followed it."],
    ];
    const w = (CW - 0.4) / 2, h = 2.1;
    items.forEach(() => {});
    for (let i = 0; i < 4; i++) {
      const x = M + (i % 2) * (w + 0.4), y = 1.75 + Math.floor(i / 2) * (h + 0.4);
      card(s, x, y, w, h, "fail-card" + i);
      await iconCircle(s, items[i][0], x + 0.4, y + 0.4, 0.8, "fail-icon" + i);
      txt(s, items[i][1], { x: x + 1.5, y: y + 0.42, w: w - 1.9, h: 0.5, fontSize: 22, bold: true, objectName: "fail-head" + i });
      txt(s, items[i][2], { x: x + 1.5, y: y + 1.0, w: w - 1.9, h: 0.85, fontSize: 17, color: MUTED, objectName: "fail-text" + i });
    }
  }
  s.addNotes("Teams already try to answer this. It fails in four ways. First, vector search returns text that mentions the topic, not the decision itself. Second, docs drift: they are written once and go stale, while commits and PRs keep telling the truth. Third, a decision that was later reversed still looks authoritative in the archive, so search happily quotes the old answer. Fourth, nobody records the link between an incident and the code change it caused. WhyGraph is built around these four problems.");

  // 4. What WhyGraph does
  pres.addSection({ title: "How it works" });
  s = content("Ask a question. Get the evidence chain", "How it works");
  {
    card(s, M, 1.75, 4.5, 2.6, "q-card", { line: AMBER, lineW: 1.75 });
    txt(s, "QUESTION", { x: M + 0.35, y: 2.05, w: 3.8, h: 0.35, fontSize: 14, bold: true, color: AMBER, charSpacing: 2, objectName: "q-label" });
    txt(s, "Why are reading statistics kept when a title moves to another source?", { x: M + 0.35, y: 2.5, w: 3.8, h: 1.8, fontSize: 23, objectName: "q-text" });
    arrow(s, M + 4.6, 3.12, 5.7, 3.12, "q-arrow", { color: AMBER, width: 2.5 });
    pill(s, "Confidence comes from graph math", M + 2.25, 4.9, 4.5, 0.6, "chip-conf", { fontSize: 14, bold: false, color: SOFT });
    pill(s, "No evidence? \"Not in the history.\"", M + 2.25, 5.65, 4.5, 0.6, "chip-refuse", { fontSize: 14, bold: false, color: SOFT });
    const x = 5.85, w = W - M - x, rows = [
      ["DECISION", "Keep reading statistics when migrating", "PR #138"],
      ["DISCUSSION", "Migrating to another source reset reading time", "Issue #127"],
      ["PERSON TO ASK", "PoonHarpoon (fix), BlueStarOne (report)", "GitHub"],
      ["DATE", "PR #138 merged 6 Nov 2026", "Linked"],
    ];
    card(s, x, 1.75, w, 4.2, "answer-card");
    rows.forEach((r, i) => {
      const y = 2.05 + i * 1.0;
      txt(s, r[0], { x: x + 0.35, y, w: 2.2, h: 0.3, fontSize: 13, bold: true, color: AMBER, charSpacing: 2, objectName: "a-label" + i });
      txt(s, r[1], { x: x + 0.35, y: y + 0.35, w: w - 0.7, h: 0.45, fontSize: 19, objectName: "a-text" + i });
      if (i < 3) { s.addShape(pres.shapes.LINE, { x: x + 0.35, y: y + 0.88, w: w - 0.7, h: 0, line: { color: EDGE, width: 1 }, objectName: "a-rule" + i }); }
    });
  }
  s.addNotes("Here is what a user sees. They type a plain question, for example: why are reading statistics kept when a title moves to another source? WhyGraph answers with a chain of evidence, not a paragraph of guesses. The decision: keep reading statistics when migrating, made in PR 138. The discussion that motivated it: issue 127, where migrating reset reading time. The person to ask: PoonHarpoon wrote the fix, BlueStarOne reported the bug. The date: PR 138 was merged on 6 November 2026. Every item links to GitHub. Confidence is computed from the graph. If nothing in the graph matches, it says the answer is not in the history.");

  // 5. Demo plan
  s = content("Live demo: three questions on a real repo", "How it works");
  txt(s, "AppFuton/Futon, an open-source Android manga and novel reader  ·  71 PRs  ·  68 issues  ·  400 comments  ·  5,181 commits", { x: M, y: 1.3, w: CW, h: 0.35, fontSize: 15, color: MUTED, objectName: "demo-repo" });
  {
    const cases = [
      ["Decision chain", "\"Why are reading stats kept after a source migration?\"", [["Issue #127", {}], ["PR #138", { line: AMBER, color: AMBER }]], "fixed by", "Shows the bug report, the fix and who to ask."],
      ["Supersession", "\"Is 'Wait for chapter updates' still a setting?\"", [["PR #112", { strike: true, color: MUTED, dash: "dash" }], ["PR #146", { line: AMBER, color: AMBER }]], "replaced by", "Found from the code diff. PR #146 never mentions PR #112."],
      ["Honest refusal", "\"Why does Futon use Kubernetes for billing?\"", [["Agent search", {}], ["0 decisions", { line: AMBER, color: AMBER }]], "so", "The code refuses: \"Not in the history.\""],
    ];
    const w = 3.75, gap = (CW - 3 * w) / 2, y = 1.95, h = 4.6;
    cases.forEach((c, i) => {
      const x = M + i * (w + gap);
      card(s, x, y, w, h, "demo-card" + i);
      s.addText(String(i + 1), { shape: pres.shapes.OVAL, x: x + 0.3, y: y + 0.3, w: 0.6, h: 0.6, fill: { color: AMBER }, line: { color: AMBER, width: 0 }, color: BG, bold: true, fontSize: 18, align: "center", valign: "middle", margin: 0, objectName: "demo-num" + i, fontFace: "Arial" });
      txt(s, c[0], { x: x + 1.05, y: y + 0.3, w: w - 1.3, h: 0.6, fontSize: 20, bold: true, valign: "middle", objectName: "demo-head" + i });
      txt(s, c[1], { x: x + 0.3, y: y + 1.15, w: w - 0.6, h: 1.25, fontSize: 18, italic: true, color: SOFT, objectName: "demo-q" + i });
      const cy = y + 2.85, pw = 1.4;
      const a = pill(s, c[2][0][0], x + 0.3 + pw / 2, cy, pw, 0.55, "demo-a" + i, Object.assign({ fontSize: 14 }, c[2][0][1]));
      const b = pill(s, c[2][1][0], x + w - 0.3 - pw / 2, cy, pw, 0.55, "demo-b" + i, Object.assign({ fontSize: 14 }, c[2][1][1]));
      arrow(s, a.cx + a.hw + 0.05, cy, b.cx - b.hw - 0.07, cy, "demo-arrow" + i, { color: AMBER, width: 1.75 });
      txt(s, c[4], { x: x + 0.3, y: y + 3.45, w: w - 0.6, h: 0.95, fontSize: 16, color: WHITE, objectName: "demo-out" + i });
    });
  }
  s.addNotes("We will run three questions live on AppFuton/Futon, an open-source Android manga and novel reader forked from Kotatsu. We collected 71 PRs, 68 issues, 400 comments and 5,181 commits. One, a decision chain: issue 127 by BlueStarOne reported that migrating to another source reset reading statistics. PR 138 by PoonHarpoon fixed it, merged on 6 November 2026. WhyGraph shows both and the person to ask. Two, supersession: PR 112, merged on 19 September 2026, added an opt-in smart resume with a default-off setting called Wait for chapter updates. PR 146, merged on 19 November 2026, made waiting the default and dropped the setting. PR 146 never mentions 112. We detect it from the code diff: the setting was added in one PR and removed in the next. A plain search would quote 112 as if it were still true. Three, honest refusal: why does Futon use Kubernetes for billing? The agent searches the graph, but its queries return no matching decision. So the code, not the model, refuses: not in the history. Every query it ran is shown on screen under the answer.");

  // 6. Pipeline
  s = content("How it works", "How it works");
  {
    txt(s, "BUILD TIME  ·  RUNS ONCE", { x: M, y: 1.4, w: 5, h: 0.3, fontSize: 13, bold: true, color: MUTED, charSpacing: 2, objectName: "row1-label" });
    const steps = [
      ["Collect", "GitHub API to JSON", false],
      ["Plain graph", "Neo4j. People, PRs, issues, commits, files. No AI.", false],
      ["Extract decisions", "Gemini. The quote must match the source, or it is dropped.", true],
      ["Find supersession", "Reverts, \"replaces #N\" text, a setting added then removed.", true],
    ];
    const w = 2.75, gap = (CW - 4 * w) / 3, y = 1.8, h = 1.75;
    steps.forEach((st, i) => {
      const x = M + i * (w + gap);
      card(s, x, y, w, h, "build" + i, st[2] ? { line: AMBER, lineW: 1.75 } : {});
      txt(s, st[0], { x: x + 0.25, y: y + 0.22, w: w - 0.5, h: 0.4, fontSize: 18, bold: true, objectName: "build-head" + i });
      txt(s, st[1], { x: x + 0.25, y: y + 0.7, w: w - 0.5, h: 0.95, fontSize: 14, color: MUTED, objectName: "build-text" + i });
      if (i < 3) { arrow(s, x + w + 0.06, y + h / 2, x + w + gap - 0.08, y + h / 2, "build-arrow" + i, { color: DIM, width: 1.75 }); }
    });
    txt(s, "QUESTION TIME", { x: M, y: 3.8, w: 5, h: 0.3, fontSize: 13, bold: true, color: MUTED, charSpacing: 2, objectName: "row2-label" });
    const y2 = 4.15, h2 = 2.0, cy = y2 + h2 / 2;
    card(s, M, cy - 0.575, 1.65, 1.15, "ask");
    txt(s, "Question", { x: M + 0.2, y: cy - 0.575, w: 1.3, h: 1.15, fontSize: 18, bold: true, valign: "middle", objectName: "ask-text" });
    arrow(s, M + 1.71, cy, 2.55 - 0.08, cy, "ask-arrow", { color: DIM, width: 1.75 });
    card(s, 2.55, y2, 3.95, h2, "agent", { line: AMBER, lineW: 1.75 });
    txt(s, "Gemini agent with tools", { x: 2.8, y: y2 + 0.15, w: 3.5, h: 0.4, fontSize: 17, bold: true, objectName: "agent-head" });
    txt(s, ["searchDecisions", "findDecisionsByFileOrSetting", "findDecisionsByNumber", "getDecisionChain", "runCypher: read-only, 5 s limit"].map((x, j, a) => ({ text: x, options: { breakLine: j < a.length - 1 } })),
      { x: 2.8, y: y2 + 0.6, w: 3.5, h: 1.3, fontSize: 13, color: MUTED, objectName: "agent-tools" });
    arrow(s, 6.56, cy, 6.75 - 0.06, cy, "agent-arrow", { color: DIM, width: 1.75 });
    s.addText("Code check", { shape: pres.shapes.DIAMOND, x: 6.75, y: cy - 0.8, w: 2.0, h: 1.6, fill: { color: CARD }, line: { color: EDGE, width: 1 }, color: WHITE, bold: true, fontSize: 14, align: "center", valign: "middle", margin: 0, objectName: "gate", fontFace: "Arial" });
    const ox = 9.1, ow = W - M - ox;
    card(s, ox, y2, ow, 0.9, "yes", { line: AMBER, lineW: 1.75 });
    txt(s, [{ text: "Found: ", options: { bold: true, color: AMBER } }, { text: "answer cites only decisions the graph returned" }], { x: ox + 0.25, y: y2, w: ow - 0.5, h: 0.9, fontSize: 15, valign: "middle", objectName: "yes-text" });
    card(s, ox, y2 + 1.1, ow, 0.9, "no");
    txt(s, [{ text: "None: ", options: { bold: true, color: AMBER } }, { text: "\"Not in the history.\"" }], { x: ox + 0.25, y: y2 + 1.1, w: ow - 0.5, h: 0.9, fontSize: 15, valign: "middle", objectName: "no-text" });
    arrow(s, 8.75, cy, ox - 0.08, y2 + 0.45, "yes-arrow", { color: AMBER, width: 1.75 });
    arrow(s, 8.75, cy, ox - 0.08, y2 + 1.55, "no-arrow", { color: DIM, width: 1.75 });
    txt(s, "Every tool call and query shows under the answer. No Gemini key? Fixed Cypher queries answer without AI.", { x: M, y: 6.35, w: CW, h: 0.3, fontSize: 13, color: MUTED, objectName: "q-footnote" });
    pill(s, "Amber border = AI step", 11.45, 1.53, 2.4, 0.4, "legend-ai", { fontSize: 12, bold: false, color: SOFT, line: AMBER });
  }
  s.addNotes("Two phases. At build time, once: we collect the repository's history from the GitHub API into JSON. We load a plain graph into Neo4j: people, PRs, issues, commits, files and config keys. No AI touches this layer. Then Gemini reads each merged PR thread once and returns whether it is a decision, a title, the why, and a word-for-word supporting quote. We check the quote against the source text. If it is not there, we drop the decision. Then we find supersession: explicit replaces or reverts text, git revert commits, and a setting added by one PR and removed by a later one. At question time, a Gemini agent answers using tools: search decisions by text, find them by file, setting or PR number, and get the full decision chain. Only when those cannot express the question does it write its own Cypher, and that runs in a read-only transaction with a 5 second limit, so the database rejects any write. Then the code checks the result: the answer may only cite decisions that getDecisionChain actually returned from Neo4j. If none remain, the code returns not in the history. Every tool call and query is shown under the answer. If Gemini is down or no key is set, fixed Cypher queries still answer, without any AI.");

  // 7. Graph model
  s = content("The graph model", "How it works");
  {
    const o = { fontSize: 15 };
    const pr = pill(s, "PR", 5.9, 1.85, 1.75, 0.6, "n-pr", o);
    const commit = pill(s, "Commit", 11.5, 1.85, 1.75, 0.6, "n-commit", o);
    const person = pill(s, "Person", 2.2, 2.45, 1.75, 0.6, "n-person", o);
    const issue = pill(s, "Issue", 9.7, 3.4, 1.75, 0.6, "n-issue", o);
    const dec = pill(s, "Decision", 5.9, 4.15, 1.9, 0.75, "n-decision", { fill: AMBER, line: AMBER, color: BG, fontSize: 17 });
    const old = pill(s, "Older decision", 2.2, 4.6, 2.1, 0.6, "n-old", { color: MUTED, dash: "dash", strike: true, line: DIM, fontSize: 15 });
    const cfg = pill(s, "ConfigKey", 5.0, 6.15, 1.75, 0.6, "n-config", o);
    const fil = pill(s, "File", 9.4, 6.15, 1.75, 0.6, "n-file", o);
    link(s, person, pr, "AUTHORED", "e-authored");
    link(s, pr, commit, "MERGED_AS", "e-merged");
    link(s, pr, issue, "FIXES", "e-fixes");
    link(s, commit, fil, "TOUCHES", "e-touches");
    const a = { color: AMBER, labelColor: AMBER };
    link(s, dec, pr, "DECIDED_IN", "e-in", a);
    link(s, dec, person, "DECIDED_BY", "e-by", a);
    link(s, dec, issue, "MOTIVATED_BY", "e-mot", a);
    link(s, dec, fil, "AFFECTS", "e-aff-file", a);
    link(s, dec, cfg, "AFFECTS", "e-aff-cfg", a);
    link(s, dec, old, "SUPERSEDES", "e-sup", a);
    s.addShape(pres.shapes.LINE, { x: M, y: 5.5, w: 0.45, h: 0, line: { color: DIM, width: 2 }, objectName: "leg-plain-line" });
    txt(s, "Plain graph: loaded from GitHub, no AI", { x: M + 0.6, y: 5.35, w: 3.0, h: 0.3, fontSize: 12, color: MUTED, objectName: "leg-plain" });
    s.addShape(pres.shapes.LINE, { x: M, y: 5.85, w: 0.45, h: 0, line: { color: AMBER, width: 2 }, objectName: "leg-dec-line" });
    txt(s, "Decision layer: AI, quote checked", { x: M + 0.6, y: 5.7, w: 3.0, h: 0.3, fontSize: 12, color: MUTED, objectName: "leg-dec" });
  }
  s.addNotes("This is the graph in Neo4j. The grey part is the plain graph, loaded straight from GitHub with no AI: a person authored a PR, the PR was merged as commits, commits touch files, and a PR fixes an issue. The amber part is the decision layer. Each decision is linked to the PR it was decided in, the person who decided it, the files and config keys it affects, and the issue that motivated it. When a newer decision replaces an older one, a SUPERSEDES edge marks the old one as superseded, so we never present it as current. Answers are walks over these edges, not guesses.");

  // 8. Graph decides
  pres.addSection({ title: "Trust" });
  s = content("The AI searches. The code decides", "Trust");
  {
    const rows = [
      ["FaBan", "The code decides what counts", "Answers cite only decisions Neo4j returned. None left: \"Not in the history.\""],
      ["FaQuoteLeft", "Every reason has a real quote", "An extracted reason must match the source word for word, or it is dropped."],
      ["FaCalculator", "Confidence is graph math", "Points for file match, discussion, not overridden, more evidence. Under 40 refuses."],
      ["FaTerminal", "Every query is on screen", "Each tool call and Cypher query, even ones the agent wrote, shows under the answer."],
    ];
    const h = 1.05, gap = 0.22;
    for (let i = 0; i < 4; i++) {
      const y = 1.7 + i * (h + gap);
      card(s, M, y, CW, h, "trust-card" + i);
      await iconCircle(s, rows[i][0], M + 0.3, y + 0.17, 0.71, "trust-icon" + i);
      txt(s, rows[i][1], { x: M + 1.3, y, w: 4.75, h, fontSize: 21, bold: true, valign: "middle", objectName: "trust-head" + i });
      txt(s, rows[i][2], { x: 6.85, y, w: W - M - 6.85 - 0.3, h, fontSize: 17, color: MUTED, valign: "middle", objectName: "trust-text" + i });
    }
  }
  s.addNotes("Judges asked for evidence that the graph, not the model, does the work. Four rules make that true. One: the code, not the model, decides what counts. The answer may only cite decisions that getDecisionChain actually returned from Neo4j. If none remain, the code returns not in the history. Two: at build time, every reason the AI extracts must come with a quote that we find word for word in the PR text. If we cannot find it, the decision is dropped, so the AI cannot invent a reason. Three: confidence is plain math over graph facts. Plus 40 if a decision matched by file, setting or PR number, or plus 20 if it matched by text only. Plus 20 for a discussion or motivating issue. Plus 20 if no newer decision overrides it. Plus 20 for two or more evidence records. Under 40, we refuse. Four: every tool call and every Cypher query, including the ones the agent wrote itself, is shown on screen under the answer, with links to every PR, issue and commit, so anyone can check it.");

  // 9. Who it is for
  pres.addSection({ title: "Market" });
  s = content("Who it is for", "Market");
  {
    const segs = [
      ["FaUserPlus", "New engineer at an Indian product startup", "Teams of 10 to 100 engineers. Can read the code, not the reasons."],
      ["FaUsers", "Engineering manager or tech lead", "Keeps the reasoning when people leave or hand over work."],
      ["FaCodeBranch", "Open-source contributor or student", "Checks whether a change is safe before making it."],
    ];
    const w = 3.75, gap = (CW - 3 * w) / 2, y = 1.75, h = 4.15;
    for (let i = 0; i < 3; i++) {
      const x = M + i * (w + gap);
      card(s, x, y, w, h, "seg-card" + i, i === 0 ? { line: AMBER, lineW: 1.75 } : {});
      await iconCircle(s, segs[i][0], x + 0.35, y + 0.35, 0.9, "seg-icon" + i);
      if (i === 0) { pill(s, "PRIMARY", x + w - 0.35 - 0.6, y + 0.8, 1.2, 0.4, "seg-primary", { fill: AMBER, line: AMBER, color: BG, fontSize: 12 }); }
      txt(s, segs[i][1], { x: x + 0.35, y: y + 1.45, w: w - 0.7, h: 1.1, fontSize: 20, bold: true, objectName: "seg-head" + i });
      txt(s, segs[i][2], { x: x + 0.35, y: y + 2.7, w: w - 0.7, h: 1.25, fontSize: 17, color: MUTED, objectName: "seg-text" + i });
    }
    txt(s, "3 customer tests: [result 1], [result 2], [result 3]  ·  Persona Use Case Matrix: [link]", { x: M, y: 6.2, w: CW, h: 0.35, fontSize: 14, color: MUTED, objectName: "seg-evidence" });
  }
  s.addNotes("Three user segments. Our primary user is a new engineer at an Indian product startup with 10 to 100 engineers. They can read the code on day one, but not the reasons, and asking seniors all day does not scale. Second, the engineering manager or tech lead doing handover during attrition: WhyGraph keeps the reasoning in the team when people leave. Third, open-source contributors and students, who need to know whether a change is safe before they send a PR. [Fill in: what we learned from our 3 customer tests, one line each, and point to the Persona Use Case Matrix.]");

  // 10. Market and business model
  s = content("Market and business model", "Market");
  {
    const w = 3.75, gap = (CW - 3 * w) / 2, y = 1.9;
    const cols = [
      ["5.8M", "people work in India's technology industry (FY2025, Nasscom).", "MARKET"],
      ["Rs 400", "per developer per month. A team plan, bought by the engineering manager.", "HYPOTHESIS"],
      ["Day 1", "Our wedge: cut the time to a new engineer's first meaningful commit.", "WEDGE"],
    ];
    cols.forEach((c, i) => {
      const x = M + i * (w + gap);
      if (i > 0) { s.addShape(pres.shapes.LINE, { x: x - gap / 2, y, w: 0, h: 3.4, line: { color: EDGE, width: 1 }, objectName: "mk-div" + i }); }
      txt(s, c[0], { x, y: y + 0.45, w: w - 0.2, h: 1.1, fontSize: 60, bold: true, color: AMBER, objectName: "mk-num" + i });
      txt(s, c[1], { x, y: y + 1.75, w: w - 0.3, h: 1.4, fontSize: 19, color: WHITE, objectName: "mk-text" + i });
      if (c[2]) { pill(s, c[2], x + 0.75, y + 0.05, 1.5, 0.38, "mk-tag" + i, { fontSize: 11, color: AMBER, line: AMBER }); }
    });
    txt(s, [{ text: "Source: Nasscom Strategic Review press release, ", options: {} },
      { text: "nasscom.in/sites/default/files/media_pdf/Nasscom SR Press release.pdf", options: { hyperlink: { url: "https://www.nasscom.in/sites/default/files/media_pdf/Nasscom%20SR%20Press%20release.pdf" }, color: MUTED } }],
      { x: M, y: 6.05, w: CW, h: 0.35, fontSize: 12, color: MUTED, objectName: "mk-source" });
  }
  s.addNotes("Market. Nasscom estimated 5.8 million employees in the Indian technology industry for FY2025. Not all of them are developers, so this is the outer bound, not our target size. Business model, and this is a hypothesis we still need to test: 400 rupees per developer per month, sold as a team plan that the engineering manager buys. Our wedge is one metric managers already care about: time to first meaningful commit for a new engineer. If WhyGraph shortens that, the plan pays for itself. It scales by adding repositories: the pipeline runs per repo, and the graph grows with the history. [Fill in: Market Fit Canvas key finding.]");

  // 11. Competition
  s = content("Competition", "Market");
  {
    const head = (t) => ({ text: t, options: { bold: true, color: AMBER, fill: { color: CARD } } });
    const row = (a, b, c) => [{ text: a, options: { bold: true } }, b, c];
    const rows = [
      [head("Tool"), head("Works from"), head("Answers")],
      row("GitHub Copilot chat", "The code", "What the code does"),
      row("Sourcegraph Cody", "The code", "What the code does"),
      row("DeepWiki", "The code", "What the code does"),
      row("Greptile", "The code", "What the code does"),
      row("Swimm", "Docs people write", "What the docs say"),
      [{ text: "WhyGraph", options: { bold: true, color: BG, fill: { color: AMBER } } },
        { text: "PR, issue and commit history", options: { bold: true, color: BG, fill: { color: AMBER } } },
        { text: "Why: cited evidence, supersession, refusal", options: { bold: true, color: BG, fill: { color: AMBER } } }],
    ];
    s.addTable(rows, { x: M, y: 1.75, w: CW, colW: [3.0, 3.6, CW - 6.6], rowH: 0.68, fontSize: 16, color: WHITE, fill: { color: BG },
      border: { type: "solid", color: HEX.accent2, pt: 1 }, valign: "middle", margin: [0, 0.15, 0, 0.15], fontFace: "Arial", objectName: "comp-table" });
  }
  s.addNotes("Where we sit. GitHub Copilot chat, Sourcegraph Cody, DeepWiki and Greptile work from the code and explain what it does. Swimm holds docs that people write and keep up to date. WhyGraph works from the history instead: PRs, issues and commits. It answers why, cites the evidence, knows when a newer decision replaced an older one, and refuses when the history does not hold the answer. We see these tools as complements: they explain the what, we explain the why. [Check each tool's current features before Q and A.]");

  // 12. Limits and next steps
  pres.addSection({ title: "Close" });
  s = content("Honest limits and next steps", "Close");
  {
    const w = (CW - 0.4) / 2, y = 1.75, h = 4.05;
    const cols = [
      ["Limits today", [
        "AI extraction covers merged PRs of one repo",
        "Entity matching uses full-text search, not full entity resolution",
        "Settings-diff supersession reads Android preference files only",
        "Customer adoption is untested",
      ]],
      ["Next steps", [
        "Extract decisions from the full history, across many repos",
        "Add real entity resolution",
        "Support more config formats",
        "Pilot with [n] startup teams and measure time to first meaningful commit",
      ]],
    ];
    cols.forEach((c, i) => {
      const x = M + i * (w + 0.4);
      card(s, x, y, w, h, "close-card" + i, i === 1 ? { line: AMBER, lineW: 1.75 } : {});
      txt(s, c[0], { x: x + 0.4, y: y + 0.3, w: w - 0.8, h: 0.5, fontSize: 22, bold: true, color: i === 1 ? AMBER : WHITE, objectName: "close-head" + i });
      txt(s, c[1].map((t, j) => ({ text: t, options: { bullet: { indent: 18 }, breakLine: j < c[1].length - 1 } })),
        { x: x + 0.4, y: y + 0.95, w: w - 0.8, h: h - 1.2, fontSize: 18, color: i === 1 ? WHITE : MUTED, paraSpaceAfter: 14, objectName: "close-list" + i });
    });
    txt(s, "ArgosX scans: [scan 1 result] then [scan 2 result]  ·  Live demo: [URL]  ·  [Team name]", { x: M, y: 6.15, w: CW, h: 0.35, fontSize: 14, color: MUTED, objectName: "close-footer" });
  }
  s.addNotes("We want to be clear about limits. AI extraction covers a slice of history: merged PRs of one repo for this demo. Entity matching uses full-text search, not full entity resolution. Settings-diff supersession understands Android preference files only. And we have not yet tested customer adoption. Next: run extraction over full histories and many repos, add real entity resolution, support more config formats, and pilot with startup teams to measure time to first meaningful commit. Security: we ran ArgosX twice; [scan 1 result], [scan 2 result], and the remediation log is in our submission. Try it at [URL]. Thank you.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
