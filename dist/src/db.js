"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDb = openDb;
exports.upsertDoc = upsertDoc;
exports.searchFts = searchFts;
exports.searchExamples = searchExamples;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function openDb(dbPath) {
    const resolvedPath = path_1.default.resolve(dbPath);
    const dir = path_1.default.dirname(resolvedPath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    const db = new better_sqlite3_1.default(resolvedPath);
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
function upsertDoc(db, title, content, url, label) {
    const existing = db.prepare("SELECT id FROM docs WHERE url = ?").get(url);
    if (existing)
        return;
    db.prepare(`
    INSERT INTO docs (title, content, url, label)
    VALUES (?, ?, ?, ?)
  `).run(title, content, url, label);
}
function searchFts(db, query, limit) {
    try {
        return db.prepare(`
      SELECT d.id, d.title, d.content, d.url, d.label
      FROM docs_fts
      JOIN docs d ON docs_fts.rowid = d.id
      WHERE docs_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit);
    }
    catch {
        return db.prepare(`
      SELECT id, title, content, url, label
      FROM docs
      WHERE content LIKE ? OR title LIKE ?
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit);
    }
}
function searchExamples(db, topic, limit) {
    try {
        return db.prepare("SELECT d.id, d.title, d.content, d.url, d.label " +
            "FROM docs_fts " +
            "JOIN docs d ON docs_fts.rowid = d.id " +
            "WHERE docs_fts MATCH ? AND d.content LIKE '%```%' " +
            "ORDER BY rank " +
            "LIMIT ?").all(topic, limit);
    }
    catch {
        return db.prepare("SELECT id, title, content, url, label " +
            "FROM docs " +
            "WHERE (content LIKE ? OR title LIKE ?) AND content LIKE '%```%' " +
            "LIMIT ?").all("%" + topic + "%", "%" + topic + "%", limit);
    }
}
