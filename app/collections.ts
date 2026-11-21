type TraceStep = {
  record: string;
  date: string;
  author: string;
  label: string;
  note: string;
  path: string;
};

export type Trace = {
  slug: string;
  name: string;
  repo: string;
  type: string;
  steps: TraceStep[];
  evidence: { file: string; changes: { kind: "added" | "removed"; text: string }[]; link: string };
  limit: string;
  workspaceQuestion?: string;
};

export const collections: Trace[] = [
  {
    slug: "chapter-updates",
    name: "When did waiting for chapter updates become the default?",
    repo: "AppFuton/Futon",
    type: "Changed decision",
    steps: [
      {
        record: "PR #112", date: "2026-09-19", author: "PoonHarpoon", label: "Waiting was optional",
        note: "Readers could opt in to waiting for newly available chapters when resuming.",
        path: "pull/112",
      },
      {
        record: "PR #146", date: "2026-11-19", author: "PoonHarpoon", label: "Waiting became the default",
        note: "Smart resume waits for chapters to refresh by default. The separate wait setting was removed.",
        path: "pull/146",
      },
    ],
    evidence: {
      file: "app/src/main/res/xml/pref_reader.xml",
      changes: [
        { kind: "added", text: "PR #112 adds reader_smart_resume_wait" },
        { kind: "removed", text: "PR #146 removes reader_smart_resume_wait" },
      ],
      link: "pull/146/files",
    },
    limit: "The preference changes connect these PRs. The later PR describes the behavior when the reader opens before chapters refresh.",
    workspaceQuestion: "Why did PR #146 replace the chapter update behavior from PR #112?",
  },
  {
    slug: "checks-workflow",
    name: "When did the original CI workflow disappear?",
    repo: "tanmayyyyayyy/NEW-HACKFRONT",
    type: "Change with an unknown reason",
    steps: [
      {
        record: "Commit d027cf0", date: "2026-11-21", author: "tanmayyyyayyy", label: "The workflow defined checks for changes",
        note: "The earlier workflow defined checks for the web app and the service, including dependency audits.",
        path: "blob/d027cf0/.github/workflows/checks.yml",
      },
      {
        record: "Commit 4324e01", date: "2026-11-22", author: "tanmayyyyayyy", label: "The migration removed the workflow",
        note: "The commit that moved the repository desk to the root deleted the old checks workflow.",
        path: "commit/4324e011d57d5a1853d8cdde047f33a0e720efa3",
      },
    ],
    evidence: {
      file: ".github/workflows/checks.yml",
      changes: [{ kind: "removed", text: "Commit 4324e01 deletes the workflow" }],
      link: "commit/4324e011d57d5a1853d8cdde047f33a0e720efa3",
    },
    limit: "The commit establishes when the file was removed. Its message gives no reason for removing the checks specifically.",
  },
  {
    slug: "reading-history",
    name: "Where did nine hours of reading go?",
    repo: "AppFuton/Futon",
    type: "Issue to fix",
    steps: [
      {
        record: "Issue #127", date: "2026-10-25", author: "BlueStarOne", label: "A reader reports lost time",
        note: "A reader reported losing recorded reading time after switching manga sources.",
        path: "issues/127",
      },
      {
        record: "PR #138", date: "2026-11-06", author: "PoonHarpoon", label: "Reading stats move with the manga",
        note: "The fix moved reading statistics to the new manga ID during migration.",
        path: "pull/138",
      },
    ],
    evidence: {
      file: "StatsDao.kt",
      changes: [{ kind: "added", text: "PR #138 adds StatsDao.move() to transfer the reading stats" }],
      link: "pull/138/files",
    },
    limit: "The issue describes the reader’s experience. The linked PR records the fix that shipped.",
    workspaceQuestion: "Why preserve reading statistics during source migration? Trace issue #127 and PR #138.",
  },
];

export function traceDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(date));
}
