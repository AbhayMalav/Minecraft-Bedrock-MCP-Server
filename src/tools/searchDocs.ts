import Database from "better-sqlite3";
import { searchFts, DocRow } from "../db.js";

export function handleSearchDocs(
  db: Database.Database,
  query: string,
  limit: number = 5
): string {
  if (!query || query.trim().length === 0) {
    return JSON.stringify({ error: "Query must not be empty." });
  }
  const results: DocRow[] = searchFts(db, query.trim(), limit);
  if (results.length === 0) {
    return JSON.stringify({ message: "No results found.", query });
  }
  return JSON.stringify(
    results.map((r) => ({
      title: r.title,
      url: r.url,
      label: r.label,
      excerpt: r.content.slice(0, 800),
    })),
    null,
    2
  );
}