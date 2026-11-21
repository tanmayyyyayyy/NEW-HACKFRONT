import type { KnowledgeRiskArea } from "./graph-types";

type PullActivity = { number: number; author?: string; files: string[] };

const sourceFile = /\.(?:[cm]?[jt]s|[jt]sx|py|go|rs|java|kt|swift|rb|php|cs|cpp|h|c)$/i;
const documentationFile = /(?:^|\/)(?:readme|architecture|design|decisions?)(?:\.[^/]*)?$|\.(?:md|mdx|rst|adoc)$/i;
const featureFolders = new Set(["api", "auth", "billing", "cache", "components", "data", "domain", "features", "infra", "network", "repository", "services", "storage", "ui", "utils"]);

function modulePath(path: string) {
  const parts = path.split("/");
  if (parts.length === 1) return parts[0];
  const sourceSet = new Set(["main", "test", "androidTest", "integrationTest"]);
  const sourceSetIndex = parts.findIndex((part, index) => parts[index - 1] === "src" && sourceSet.has(part));
  if (sourceSetIndex >= 0) {
    const packageIndex = sourceSetIndex + 2;
    const featureIndex = parts.slice(packageIndex).findIndex(part => featureFolders.has(part.toLowerCase()));
    const end = featureIndex >= 0 ? packageIndex + featureIndex + 1 : Math.min(parts.length - 1, packageIndex + 2);
    return parts.slice(0, Math.max(sourceSetIndex + 1, end)).join("/");
  }
  if (["app", "src", "lib", "pages", "packages", "services", "components"].includes(parts[0])) {
    return parts.slice(0, Math.min(parts[0] === "packages" ? 3 : 2, parts.length)).join("/");
  }
  return parts[0];
}

export function knowledgeRiskAreas(paths: string[], pullActivity: PullActivity[] = [], decisionPulls = new Set<number>()): KnowledgeRiskArea[] {
  const modules = new Map<string, { sourceFiles: Set<string>; documentationFiles: Set<string>; contributors: Map<string, Set<number>>; prs: Set<number>; decisions: Set<number> }>();
  const get = (path: string) => {
    const key = modulePath(path);
    let module = modules.get(key);
    if (!module) {
      module = { sourceFiles: new Set(), documentationFiles: new Set(), contributors: new Map(), prs: new Set(), decisions: new Set() };
      modules.set(key, module);
    }
    return { key, module };
  };
  for (const path of paths) {
    if (sourceFile.test(path)) get(path).module.sourceFiles.add(path);
    if (documentationFile.test(path)) get(path).module.documentationFiles.add(path);
  }
  for (const pull of pullActivity) {
    for (const path of pull.files) {
      const { key, module } = get(path);
      if (!module.sourceFiles.size) continue;
      module.prs.add(pull.number);
      if (pull.author) {
        const contributions = module.contributors.get(pull.author) ?? new Set<number>();
        contributions.add(pull.number);
        module.contributors.set(pull.author, contributions);
      }
      if (decisionPulls.has(pull.number)) module.decisions.add(pull.number);
    }
  }
  const risks = Array.from(modules, ([path, module]): KnowledgeRiskArea | undefined => {
    const sourceFiles = module.sourceFiles.size;
    if (!sourceFiles) return undefined;
    const authors = Array.from(module.contributors, ([author, prs]) => [author, prs.size] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const pullCount = module.prs.size;
    const topContributorShare = pullCount ? Math.max(0, ...authors.map(([, count]) => count)) / pullCount : 0;
    const sparseDocs = module.documentationFiles.size === 0 || module.documentationFiles.size / sourceFiles < 0.08;
    const concentrated = pullCount >= 3 && (authors.length <= 2 || topContributorShare >= 0.65);
    const disconnected = pullCount >= 2 && module.decisions.size === 0;
    const signals = [
      ...(sparseDocs ? ["Sparse rationale documentation"] : []),
      ...(concentrated ? ["Historical changes concentrated in a few contributors"] : []),
      ...(disconnected ? ["No linked decision trail in sampled history"] : []),
    ];
    if (!signals.length) return undefined;
    const riskScore = Number((Number(sparseDocs) * 0.35 + Number(concentrated) * 0.4 + Number(disconnected) * 0.25).toFixed(2));
    const name = path.split("/").at(-1) || path;
    return {
      id: path,
      name,
      path,
      sourceFiles,
      documentationFiles: module.documentationFiles.size,
      sampledPullRequests: pullCount,
      contributors: authors.length,
      topContributor: authors[0]?.[0],
      topContributorShare,
      decisionConnections: module.decisions.size,
      riskScore,
      signals,
      confidence: pullActivity.length && pullCount ? "sampled-history" as const : "structure-only" as const,
    };
  });
  return risks.filter((area): area is KnowledgeRiskArea => area !== undefined)
    .sort((a, b) => b.riskScore - a.riskScore || b.sourceFiles - a.sourceFiles || a.path.localeCompare(b.path))
    .slice(0, 24);
}
