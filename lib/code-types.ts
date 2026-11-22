export type CodeLine = { text: string; old?: number; line?: number; change?: "added" | "removed" };

export type CodeSnippet = {
  path: string;
  lines: CodeLine[];
  url: string;
  editUrl?: string;
  diffUrl?: string;
  basis: "matching lines" | "file opening" | "pull request diff";
};

export function pullTarget(input: string) {
  const match = /^https:\/\/github\.com\/([a-z\d-]{1,39}\/[a-z\d_.-]{1,100})\/pull\/([1-9]\d{0,9})(?:\/(?:files|commits))?\/?(?:[?#].*)?$/i.exec(input.trim());
  if (!match || Number(match[2]) > 2_000_000_000) return null;
  return { repo: match[1], number: Number(match[2]) };
}

export function chatSource(input: string) {
  const value = input.trim();
  const pull = pullTarget(value);
  if (pull) return `https://github.com/${pull.repo}/pull/${pull.number}`;
  return /^(?:https:\/\/github\.com\/)?([a-z\d-]{1,39}\/[a-z\d_.-]{1,100})\/?$/i.exec(value)?.[1] ?? null;
}

export function sourceFromMessage(message: string) {
  const link = message.match(/https:\/\/github\.com\/[^\s<>()]+/i)?.[0].replace(/[.,;!?]+$/, "");
  const source = chatSource(link ?? message);
  return source ? { source, question: link ? message.replace(link, "").trim() : "" } : null;
}
