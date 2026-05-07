# AGENT TASK: Build `mcbedrock-mcp` — A Minecraft Bedrock Addon Development MCP Server

## Your Role
You are a senior TypeScript/Node.js engineer. Your job is to build a fully working **Model Context Protocol (MCP) server** called `mcbedrock-mcp` from scratch. This server will give AI coding assistants (like Claude Desktop, Cursor, or OpenCode itself) real-time access to Minecraft Bedrock scripting and addon documentation, searchable via tools.

This is inspired by the `mcmodding-mcp` server by OGMatrix (which targets Minecraft Java/Fabric). We are building the Bedrock equivalent.

---

## What You Are Building

A standalone Node.js MCP server that:
1. Crawls and indexes Bedrock scripting documentation from `wiki.bedrock.dev` and `learn.microsoft.com/minecraft` into a local SQLite database
2. Exposes MCP tools (`search_bedrock_docs`, `get_bedrock_example`, `explain_bedrock_concept`) that AI clients can call
3. Uses SQLite FTS5 (Full-Text Search) for fast, ranked search results
4. Is configurable via a `config.json` file
5. Can be registered with Claude Desktop or any MCP client via stdio transport

---

## STEP 1 — Scaffold the Project

Create the following directory structure. Do NOT deviate from it:

```
mcbedrock-mcp/
├── src/
│   ├── index.ts
│   ├── db.ts
│   └── tools/
│       ├── searchDocs.ts
│       ├── getExample.ts
│       └── explainConcept.ts
├── scripts/
│   └── indexDocs.ts
├── data/                   ← created at runtime, do NOT commit
├── config.json
├── package.json
├── tsconfig.json
└── README.md
```

Run these exact shell commands to initialize:

```bash
mkdir -p mcbedrock-mcp/src/tools mcbedrock-mcp/scripts mcbedrock-mcp/data
cd mcbedrock-mcp
npm init -y
npm install @modelcontextprotocol/sdk better-sqlite3 node-fetch cheerio
npm install -D typescript @types/node @types/better-sqlite3 ts-node
```

---

## STEP 2 — Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## STEP 3 — Create `config.json`

This controls which documentation URLs get crawled. Make it easy to extend.

```json
{
  "dbPath": "./data/bedrock-docs.db",
  "maxContentLength": 12000,
  "crawlDelayMs": 600,
  "sources": [
    {
      "url": "https://wiki.bedrock.dev/scripting/scripting-intro.html",
      "label": "Scripting Intro"
    },
    {
      "url": "https://wiki.bedrock.dev/scripting/script-server.html",
      "label": "Script Server"
    },
    {
      "url": "https://wiki.bedrock.dev/scripting/typescript.html",
      "label": "TypeScript Setup"
    },
    {
      "url": "https://wiki.bedrock.dev/scripting/script-net.html",
      "label": "Script Net/HTTP"
    },
    {
      "url": "https://wiki.bedrock.dev/items/items-intro.html",
      "label": "Items"
    },
    {
      "url": "https://wiki.bedrock.dev/blocks/blocks-intro.html",
      "label": "Blocks"
    },
    {
      "url": "https://wiki.bedrock.dev/entities/entity-intro-bp.html",
      "label": "Entities (Behavior Pack)"
    },
    {
      "url": "https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/minecraft-server",
      "label": "@minecraft/server Module"
    },
    {
      "url": "https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/next-steps",
      "label": "Scripting Next Steps"
    },
    {
      "url": "https://learn.microsoft.com/en-us/minecraft/creator/documents/addentity",
      "label": "Add Custom Entity"
    },
    {
      "url": "https://learn.microsoft.com/en-us/minecraft/creator/documents/behaviorpack",
      "label": "Behavior Pack Intro"
    },
    {
      "url": "https://learn.microsoft.com/en-us/minecraft/creator/documents/resourcepack",
      "label": "Resource Pack Intro"
    }
  ]
}
```

---

## STEP 4 — Create `src/db.ts`

This module handles all database setup and queries. It uses SQLite FTS5 for full-text ranked search.

```typescript
// src/db.ts
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
  // Check if exists; skip FTS trigger re-insertion issues
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
    // FTS5 MATCH search — fast ranked results
    return db.prepare(`
      SELECT d.id, d.title, d.content, d.url, d.label
      FROM docs_fts
      JOIN docs d ON docs_fts.rowid = d.id
      WHERE docs_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as DocRow[];
  } catch {
    // Fallback to LIKE search if FTS query syntax is invalid
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
  // Target pages that have code blocks (indicated by backtick presence)
  try {
    return db.prepare(`
      SELECT d.id, d.title, d.content, d.url, d.label
      FROM docs_fts
      JOIN docs d ON docs_fts.rowid = d.id
      WHERE docs_fts MATCH ? AND d.content LIKE '%\`\`\`%'
      ORDER BY rank
      LIMIT ?
    `).all(topic, limit) as DocRow[];
  } catch {
    return db.prepare(`
      SELECT id, title, content, url, label
      FROM docs
      WHERE (content LIKE ? OR title LIKE ?) AND content LIKE '%\`\`\`%'
      LIMIT ?
    `).all(`%${topic}%`, `%${topic}%`, limit) as DocRow[];
  }
}
```

---

## STEP 5 — Create the Three Tool Files

### `src/tools/searchDocs.ts`

```typescript
// src/tools/searchDocs.ts
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
```

### `src/tools/getExample.ts`

```typescript
// src/tools/getExample.ts
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
```

### `src/tools/explainConcept.ts`

```typescript
// src/tools/explainConcept.ts
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
```

---

## STEP 6 — Create the Main MCP Server (`src/index.ts`)

This is the entry point. It connects all tools to the MCP SDK and starts the stdio transport.

```typescript
#!/usr/bin/env node
// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import fs from "fs";
import { openDb } from "./db.js";
import { handleSearchDocs } from "./tools/searchDocs.js";
import { handleGetExample } from "./tools/getExample.js";
import { handleExplainConcept } from "./tools/explainConcept.js";

// Load config
const configPath = path.resolve(__dirname, "../config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const db = openDb(path.resolve(__dirname, "../" + config.dbPath));

// Check if DB has been indexed
const rowCount = (db.prepare("SELECT COUNT(*) as c FROM docs").get() as { c: number }).c;
if (rowCount === 0) {
  process.stderr.write(
    "[mcbedrock-mcp] WARNING: Database is empty. Run 'npm run index-docs' first.\n"
  );
}

const server = new Server(
  {
    name: "mcbedrock-mcp",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

// ---- LIST TOOLS ----
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_bedrock_docs",
      description:
        "Search Minecraft Bedrock Edition scripting and addon documentation. Use this for any questions about the @minecraft/server API, behavior packs, resource packs, entities, items, blocks, or events.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search keywords. E.g. 'PlayerJoinAfterEvent', 'world.sendMessage', 'ItemStack', 'entity behavior'",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return. Default: 5, max: 10.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_bedrock_example",
      description:
        "Get code examples for a Minecraft Bedrock scripting topic. Returns actual TypeScript/JavaScript code blocks from the documentation.",
      inputSchema: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "The scripting topic you need an example for. E.g. 'http request', 'subscribe to event', 'spawn entity', 'ItemStack constructor'",
          },
        },
        required: ["topic"],
      },
    },
    {
      name: "explain_bedrock_concept",
      description:
        "Get a plain-English explanation of a Minecraft Bedrock addon or scripting concept. Best for architecture questions, concepts, and terminology.",
      inputSchema: {
        type: "object",
        properties: {
          concept: {
            type: "string",
            description:
              "The concept to explain. E.g. 'behavior pack manifest', 'Script API vs Add-On', 'game loop tick', 'ScriptEventSource'",
          },
        },
        required: ["concept"],
      },
    },
  ],
}));

// ---- CALL TOOL HANDLER ----
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    let text = "";

    if (name === "search_bedrock_docs") {
      const limit = Math.min((args?.limit as number) || 5, 10);
      text = handleSearchDocs(db, args?.query as string, limit);
    } else if (name === "get_bedrock_example") {
      text = handleGetExample(db, args?.topic as string);
    } else if (name === "explain_bedrock_concept") {
      text = handleExplainConcept(db, args?.concept as string);
    } else {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Tool error: ${message}` }],
      isError: true,
    };
  }
});

// ---- START SERVER ----
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[mcbedrock-mcp] Server started and ready.\n");
}

main().catch((err) => {
  process.stderr.write(`[mcbedrock-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});
```

---

## STEP 7 — Create the Documentation Indexer (`scripts/indexDocs.ts`)

This script is run ONCE to crawl and populate the database. It must respect crawl delay.

```typescript
// scripts/indexDocs.ts
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import path from "path";
import fs from "fs";
import { openDb, upsertDoc } from "../src/db.js";

interface Source {
  url: string;
  label: string;
}

interface Config {
  dbPath: string;
  maxContentLength: number;
  crawlDelayMs: number;
  sources: Source[];
}

const configPath = path.resolve(__dirname, "../config.json");
const config: Config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const db = openDb(path.resolve(__dirname, "../" + config.dbPath));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTextFromHtml(html: string): { title: string; content: string } {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $("nav, footer, header, script, style, .sidebar, .nav, .menu, .toc, .breadcrumb, aside").remove();

  // Extract title
  const title =
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Untitled";

  // Prefer main content area
  let content =
    $("main").text() ||
    $("article").text() ||
    $(".content").text() ||
    $("body").text();

  // Clean up excessive whitespace
  content = content
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  // Also try to preserve code blocks from markdown/pre tags
  const codeBlocks: string[] = [];
  $("pre, code").each((_, el) => {
    const code = $(el).text().trim();
    if (code.length > 20) {
      codeBlocks.push("```\n" + code + "\n```");
    }
  });

  // Append code blocks at the end if not already in content
  if (codeBlocks.length > 0) {
    content = content + "\n\n--- Code Examples ---\n" + codeBlocks.slice(0, 5).join("\n\n");
  }

  return {
    title,
    content: content.slice(0, config.maxContentLength),
  };
}

async function crawlPage(source: Source): Promise<void> {
  const { url, label } = source;
  console.log(`⏳ Crawling [${label}]: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "mcbedrock-mcp-indexer/1.0 (documentation indexer for MCP server)",
        "Accept": "text/html",
      },
      timeout: 15000,
    } as Parameters<typeof fetch>[1]);

    if (!response.ok) {
      console.warn(`  ⚠️  HTTP ${response.status} — skipping`);
      return;
    }

    const html = await response.text();
    const { title, content } = extractTextFromHtml(html);

    if (content.length < 50) {
      console.warn(`  ⚠️  Content too short — skipping`);
      return;
    }

    upsertDoc(db, title, content, url, label);
    console.log(`  ✅ Indexed: "${title}" (${content.length} chars)`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Failed: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("🚀 Starting Bedrock documentation indexer...");
  console.log(`📦 Database: ${config.dbPath}`);
  console.log(`📄 Sources: ${config.sources.length} pages to crawl\n`);

  for (const source of config.sources) {
    await crawlPage(source);
    await sleep(config.crawlDelayMs);
  }

  const count = (db.prepare("SELECT COUNT(*) as c FROM docs").get() as { c: number }).c;
  console.log(`\n✅ Done! ${count} pages indexed in database.`);
  db.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

---

## STEP 8 — Update `package.json`

Replace the contents of `package.json` with this. The `bin` field makes it installable globally:

```json
{
  "name": "mcbedrock-mcp",
  "version": "1.0.0",
  "description": "MCP server for Minecraft Bedrock Edition scripting and addon documentation",
  "main": "dist/src/index.js",
  "bin": {
    "mcbedrock-mcp": "./dist/src/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "index-docs": "ts-node scripts/indexDocs.ts",
    "start": "node dist/src/index.js",
    "rebuild-db": "rm -f data/bedrock-docs.db && npm run index-docs"
  },
  "keywords": ["minecraft", "bedrock", "mcp", "scripting", "addon"],
  "license": "MIT"
}
```

> **IMPORTANT:** After updating package.json, the `dependencies` and `devDependencies` fields that npm created earlier must be preserved. Merge them — do NOT wipe them.

---

## STEP 9 — Create `README.md`

```markdown
# mcbedrock-mcp

A Model Context Protocol (MCP) server that gives AI assistants access to Minecraft Bedrock Edition scripting and addon documentation.

## Setup

### 1. Install dependencies
\`\`\`bash
npm install
\`\`\`

### 2. Build
\`\`\`bash
npm run build
\`\`\`

### 3. Index documentation (run once)
\`\`\`bash
npm run index-docs
\`\`\`

### 4. Test it works
\`\`\`bash
npm start
\`\`\`
You should see: `[mcbedrock-mcp] Server started and ready.`
Press Ctrl+C.

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

\`\`\`json
{
  "mcpServers": {
    "mcbedrock": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcbedrock-mcp/dist/src/index.js"]
    }
  }
}
\`\`\`

Replace `/ABSOLUTE/PATH/TO/` with the real path to this project folder.

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_bedrock_docs` | Full-text search across all indexed Bedrock docs |
| `get_bedrock_example` | Get code examples for a specific scripting topic |
| `explain_bedrock_concept` | Get an explanation of a Bedrock addon concept |

## Adding More Docs

Edit `config.json` and add entries to the `sources` array, then run `npm run rebuild-db`.
```

---

## STEP 10 — Build and Verify

Run these commands IN ORDER. Stop and report any errors at each step before continuing.

```bash
# 1. Compile TypeScript
npm run build

# Verify: dist/ folder should now exist with dist/src/index.js and dist/scripts/indexDocs.js

# 2. Index the documentation (requires internet connection — ~15 seconds)
npm run index-docs

# Verify: you should see ~12 "✅ Indexed" lines and "Done! X pages indexed"

# 3. Confirm database was created
ls -lh data/bedrock-docs.db

# 4. Start the server in test mode (it will just wait for input via stdio)
node dist/src/index.js
# Expected output: [mcbedrock-mcp] Server started and ready.
# Press Ctrl+C to exit.
```

---

## STEP 11 — Error Handling Checklist

As you build, ensure these edge cases are handled:

- [ ] If `data/bedrock-docs.db` doesn't exist, `openDb()` creates it automatically
- [ ] If `docs_fts` FTS5 query syntax is invalid (e.g. special chars), fall back to LIKE search
- [ ] If a crawl URL returns HTTP 4xx/5xx, log a warning and continue — do NOT crash
- [ ] If a page has less than 50 chars of content, skip it
- [ ] If the DB is empty when the server starts, write a warning to `stderr` (NOT stdout — MCP uses stdout for protocol messages)
- [ ] All `process.stderr.write()` calls use `\n` terminated strings

---

## STEP 12 — Final File Count Verification

When complete, this is the expected file tree:

```
mcbedrock-mcp/
├── config.json              ✅
├── package.json             ✅
├── tsconfig.json            ✅
├── README.md                ✅
├── src/
│   ├── index.ts             ✅
│   ├── db.ts                ✅
│   └── tools/
│       ├── searchDocs.ts    ✅
│       ├── getExample.ts    ✅
│       └── explainConcept.ts ✅
├── scripts/
│   └── indexDocs.ts         ✅
├── dist/                    ✅ (generated by tsc)
└── data/
    └── bedrock-docs.db      ✅ (generated by index-docs)
```

---

## IMPORTANT CONSTRAINTS — DO NOT VIOLATE

1. **Never write to `stdout` for logging** — MCP uses stdout for protocol communication. All debug/info output MUST go to `process.stderr.write(...)`.
2. **Do not use ESM (`import/export` with `"type": "module"`)** — stick with CommonJS (`require`/`module.exports`) as compiled by TypeScript. The MCP SDK works with both but CommonJS avoids `.js` extension confusion in compiled output.
3. **Do not use `localStorage` or `sessionStorage`** — this is a Node.js server, not a browser.
4. **Internet required for indexing only** — the server itself works fully offline once the DB is built.
5. **All paths in code must use `path.resolve()`** — never hardcode absolute paths.
6. **The `data/` directory must be gitignored** — add a `.gitignore` with `data/` and `dist/` and `node_modules/`.

---

## DELIVERABLE

When finished, confirm:
- `npm run build` succeeds with zero TypeScript errors
- `npm run index-docs` completes and shows indexed page count
- `npm start` starts without crashing and shows the ready message
- All 12 source files listed in Step 12 exist
- The README accurately reflects how to connect this to Claude Desktop

