import type { Evidence } from "@/lib/repository-chat";

type Connection = { kind: string; basis: string; record: Evidence; from?: string; to?: string };
export type TrailRow = { record: Evidence; links: Connection[] };

export function EvidenceTrail({ rows }: { rows: TrailRow[] }) {
  const overrides = new Map<string, { older: Evidence; newer: Evidence; basis: string }>();
  for (const { record, links } of rows) for (const link of links) {
    if (link.kind !== "SUPERSEDES" || !link.from || !link.to) continue;
    const older = record.id === link.to ? record : link.record;
    const newer = record.id === link.from ? record : link.record;
    overrides.set(link.from + "/" + link.to, { older, newer, basis: link.basis });
  }
  if (!overrides.size) return null;
  return (
    <section aria-label="Decision changes" className="overrides">
      {Array.from(overrides.entries()).map(([key, pair]) => (
        <div key={key} className="override-card">
          <h4>Decision changed</h4>
          <ol>
            {[pair.older, pair.newer].map((r, i) => (
              <li key={r.id}>
                <small>{i === 0 ? "Earlier decision" : "Later change"} · {r.date.slice(0, 10)}</small>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.id} · {r.title}
                </a>
              </li>
            ))}
          </ol>
          <p className="override-basis">{pair.basis}</p>
        </div>
      ))}
    </section>
  );
}

export function downloadTrail(question: string, rows: TrailRow[]) {
  const text = [
    question,
    ...rows.flatMap(({ record, links }) => [
      "",
      record.title,
      [record.kind, record.author, record.date].filter(Boolean).join(" · "),
      record.url,
      record.text,
      ...links.map((link) => [link.kind, link.basis, link.record.url].join(" · ")),
    ]),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "skillforge-decision-trail.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatMarkdownTrail(question: string, rows: TrailRow[]): string {
  const lines: string[] = [
    `# SkillForge Handover Note: ${question}`,
    `Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
    "",
    "## Verified Decision Trail",
    ...rows.flatMap(({ record, links }) => [
      `### [${record.id}] ${record.title}`,
      `- **Type**: ${record.kind}`,
      `- **Author**: @${record.author || "unknown"}`,
      `- **Date**: ${record.date.slice(0, 10)}`,
      `- **Source URL**: ${record.url}`,
      record.files?.length ? `- **Changed Files**: \`${record.files.join("`, `")}\`` : "",
      "",
      `> ${record.text.slice(0, 450).replace(/\n/g, " ")}${record.text.length > 450 ? "..." : ""}`,
      "",
      ...(links.length
        ? [
            "**Graph Relationships:**",
            ...links.map((l) => `- \`${l.kind}\` (${l.basis}): [${l.record.id}](${l.record.url}) - ${l.record.title}`),
            "",
          ]
        : []),
    ]),
  ].filter(Boolean);
  return lines.join("\n");
}
