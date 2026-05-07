import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface DocRow {
  id: number;
  title: string;
  content: string;
  url: string;
  label: string;
}

export function openDb(dbPath: string): Database.Database {
  const resolvedPath = path.resolve(dbPath);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      title   TEXT NOT NULL,
      content TEXT NOT NULL,
      url     TEXT UNIQUE NOT NULL,
      label   TEXT NOT NULL DEFAULT ''
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
      title,
      content,
      content='docs',
      content_rowid='id'
    );
    CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
      INSERT INTO docs_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON docs BEGIN
      INSERT INTO docs_fts(docs_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
    END;
  `);
  return db;
}

export function upsertDoc(
  db: Database.Database,
  title: string,
  content: string,
  url: string,
  label: string
): void {
  const existing = db.prepare("SELECT id FROM docs WHERE url = ?").get(url);
  if (existing) return;

  db.prepare(`
    INSERT INTO docs (title, content, url, label)
    VALUES (?, ?, ?, ?)
  `).run(title, content, url, label);
}

export function searchFts(
  db: Database.Database,
  query: string,
  limit: number
): DocRow[] {
  try {
    return db.prepare(`
      SELECT d.id, d.title, d.content, d.url, d.label
      FROM docs_fts
      JOIN docs d ON docs_fts.rowid = d.id
      WHERE docs_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as DocRow[];
  } catch {
    return db.prepare(`
      SELECT id, title, content, url, label
      FROM docs
      WHERE content LIKE ? OR title LIKE ?
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit) as DocRow[];
  }
}

export function searchExamples(
  db: Database.Database,
  topic: string,
  limit: number
): DocRow[] {
  try {
    return db.prepare(
      "SELECT d.id, d.title, d.content, d.url, d.label " +
      "FROM docs_fts " +
      "JOIN docs d ON docs_fts.rowid = d.id " +
      "WHERE docs_fts MATCH ? AND d.content LIKE '%```%' " +
      "ORDER BY rank " +
      "LIMIT ?"
    ).all(topic, limit) as DocRow[];
  } catch {
    return db.prepare(
      "SELECT id, title, content, url, label " +
      "FROM docs " +
      "WHERE (content LIKE ? OR title LIKE ?) AND content LIKE '%```%' " +
      "LIMIT ?"
    ).all("%" + topic + "%", "%" + topic + "%", limit) as DocRow[];
  }
}