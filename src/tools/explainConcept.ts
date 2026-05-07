import Database from "better-sqlite3";
import { searchFts, DocRow } from "../db.js";

export function handleExplainConcept(
  db: Database.Database,
  concept: string
): string {
  if (!concept || concept.trim().length === 0) {
    return JSON.stringify({ error: "Concept must not be empty." });
  }
  const results: DocRow[] = searchFts(db, concept.trim(), 2);
  if (results.length === 0) {
    return JSON.stringify({
      message: `No documentation found for concept: "${concept}".`,
    });
  }
  return JSON.stringify(
    results.map((r) => ({
      title: r.title,
      url: r.url,
      label: r.label,
      explanation: r.content.slice(0, 1500),
    })),
    null,
    2
  );
}