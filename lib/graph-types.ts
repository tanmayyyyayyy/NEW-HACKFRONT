export type GraphNode = {
  id: string;
  label: string;
  detail: string;
  kind: "folder" | "file" | "package" | "pull" | "commit";
  url?: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: "CONTAINS" | "IMPORTS" | "PARENT" | "INCLUDES" | "REFERENCES" | "SUPERSEDES";
};

export type RepositoryGraph = {
  repository: string;
  source?: "folder";
  revision: string;
  indexedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  coverage: { files: number; importFiles: number; treePartial: boolean; historyPartial: boolean };
};
