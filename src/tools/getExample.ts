import Database from "better-sqlite3";
import { searchExamples, DocRow } from "../db.js";

function extractCodeBlocks(content: string): string[] {
  const regex = /```[\s\S]*?```/g;
  const matches = content.match(regex) || [];
  return matches.slice(0, 3);
}

export function handleGetExample(
  db: Database.Database,
  topic: string
): string {
  if (!topic || topic.trim().length === 0) {
    return JSON.stringify({ error: "Topic must not be empty." });
  }
  const results: DocRow[] = searchExamples(db, topic.trim(), 3);
  if (results.length === 0) {
    return JSON.stringify({
      message: "No code examples found for this topic.",
      topic,
    });
  }
  const output = results.map((r) => ({
    title: r.title,
    url: r.url,
    codeBlocks: extractCodeBlocks(r.content),
  }));
  return JSON.stringify(output, null, 2);
}