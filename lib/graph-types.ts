export type GraphNode = {
  id: string;
  label: string;
  detail: string;
  kind: "folder" | "file" | "package" | "pull" | "commit" | "risk";
  url?: string;
  createdAt?: string;
  mergedAt?: string;
  author?: string;
  evidence?: string;
  risk?: KnowledgeRiskArea;
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: "CONTAINS" | "IMPORTS" | "PARENT" | "INCLUDES" | "REFERENCES" | "SUPERSEDES" | "COVERS";
};

export type KnowledgeRiskArea = {
  id: string;
  name: string;
  path: string;
  sourceFiles: number;
  documentationFiles: number;
  sampledPullRequests: number;
  contributors: number;
  topContributor?: string;
  topContributorShare: number;
  decisionConnections: number;
  riskScore: number;
  signals: string[];
  confidence: "sampled-history" | "structure-only";
};

export type RepositoryGraph = {
  repository: string;
  source?: "folder";
  revision: string;
  indexedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  riskAreas?: KnowledgeRiskArea[];
  riskMapVersion?: 1;
  coverage: { files: number; importFiles: number; treePartial: boolean; historyPartial: boolean };
};
