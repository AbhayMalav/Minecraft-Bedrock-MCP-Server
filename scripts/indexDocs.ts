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

const configPath = path.resolve(__dirname, "../../config.json");
const config: Config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const db = openDb(path.resolve(__dirname, "../../" + config.dbPath));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTextFromHtml(html: string): { title: string; content: string } {
  const $ = cheerio.load(html);

  $("nav, footer, header, script, style, .sidebar, .nav, .menu, .toc, .breadcrumb, aside").remove();

  const title =
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Untitled";

  let content =
    $("main").text() ||
    $("article").text() ||
    $(".content").text() ||
    $("body").text();

  content = content
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  const codeBlocks: string[] = [];
  $("pre, code").each((_, el) => {
    const code = $(el).text().trim();
    if (code.length > 20) {
      codeBlocks.push("```\n" + code + "\n```");
    }
  });

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
  console.log(`Crawling [${label}]: ${url}`);

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
      console.warn(`  HTTP ${response.status} — skipping`);
      return;
    }

    const html = await response.text();
    const { title, content } = extractTextFromHtml(html);

    if (content.length < 50) {
      console.warn(`  Content too short — skipping`);
      return;
    }

    upsertDoc(db, title, content, url, label);
    console.log(`  Indexed: "${title}" (${content.length} chars)`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  Failed: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("Starting Bedrock documentation indexer...");
  console.log(`Database: ${config.dbPath}`);
  console.log(`Sources: ${config.sources.length} pages to crawl\n`);

  for (const source of config.sources) {
    await crawlPage(source);
    await sleep(config.crawlDelayMs);
  }

  const count = (db.prepare("SELECT COUNT(*) as c FROM docs").get() as { c: number }).c;
  console.log(`\nDone! ${count} pages indexed in database.`);
  db.close();
}

main().catch((err) => {
  process.stderr.write(`[mcbedrock-mcp] Indexing failed (network issue?): ${err.message}\n`);
  process.stderr.write(`[mcbedrock-mcp] Run 'npx mcbedrock-mcp index-docs' manually when online.\n`);
  process.exit(0);
});