import neo4j, { type Driver } from "neo4j-driver";

const globalForNeo4j = globalThis as { neo4jDriver?: Driver };

/** One driver per process; Next.js dev reloads would otherwise open a new pool on every edit. */
export const driver =
  globalForNeo4j.neo4jDriver ??
  neo4j.driver(
    process.env.NEO4J_URI ?? "bolt://127.0.0.1:7687",
    neo4j.auth.basic(process.env.NEO4J_USERNAME ?? "neo4j", process.env.NEO4J_PASSWORD ?? ""),
  );

globalForNeo4j.neo4jDriver = driver;
