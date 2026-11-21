import { readFile } from "node:fs/promises";

export type Pull = {
  number: number;
  title: string;
  body: string;
  author: string;
  createdAt: string;
  mergedAt: string | null;
  state: string;
  url: string;
  mergeSha: string | null;
  files: { path: string; settings: { added: string[]; removed: string[] } }[];
};

export type Issue = {
  number: number;
  title: string;
  body: string;
  author: string;
  createdAt: string;
  state: string;
  url: string;
};

export type Comment = { parent: number; author: string; body: string; createdAt: string; url: string };

export type Commit = { sha: string; message: string; author: string; date: string; url: string };

export type GithubData = {
  repo: string;
  collectedAt: string;
  pulls: Pull[];
  issues: Issue[];
  comments: Comment[];
  commits: Commit[];
};

export async function readGithubData(): Promise<GithubData> {
  return JSON.parse(await readFile("data/github.json", "utf8"));
}

/** Issue and PR numbers a text mentions as #N. */
export function findMentions(text: string): number[] {
  return [...text.matchAll(/(?<![\w/])#(\d+)\b/g)].map((match) => Number(match[1]));
}
