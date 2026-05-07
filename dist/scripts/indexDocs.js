"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const cheerio = __importStar(require("cheerio"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_js_1 = require("../src/db.js");
const configPath = path_1.default.resolve(__dirname, "../../config.json");
const config = JSON.parse(fs_1.default.readFileSync(configPath, "utf-8"));
const db = (0, db_js_1.openDb)(path_1.default.resolve(__dirname, "../../" + config.dbPath));
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function extractTextFromHtml(html) {
    const $ = cheerio.load(html);
    $("nav, footer, header, script, style, .sidebar, .nav, .menu, .toc, .breadcrumb, aside").remove();
    const title = $("h1").first().text().trim() ||
        $("title").text().trim() ||
        "Untitled";
    let content = $("main").text() ||
        $("article").text() ||
        $(".content").text() ||
        $("body").text();
    content = content
        .replace(/\t/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ ]{2,}/g, " ")
        .trim();
    const codeBlocks = [];
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
async function crawlPage(source) {
    const { url, label } = source;
    console.log(`Crawling [${label}]: ${url}`);
    try {
        const response = await (0, node_fetch_1.default)(url, {
            headers: {
                "User-Agent": "mcbedrock-mcp-indexer/1.0 (documentation indexer for MCP server)",
                "Accept": "text/html",
            },
            timeout: 15000,
        });
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
        (0, db_js_1.upsertDoc)(db, title, content, url, label);
        console.log(`  Indexed: "${title}" (${content.length} chars)`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Failed: ${message}`);
    }
}
async function main() {
    console.log("Starting Bedrock documentation indexer...");
    console.log(`Database: ${config.dbPath}`);
    console.log(`Sources: ${config.sources.length} pages to crawl\n`);
    for (const source of config.sources) {
        await crawlPage(source);
        await sleep(config.crawlDelayMs);
    }
    const count = db.prepare("SELECT COUNT(*) as c FROM docs").get().c;
    console.log(`\nDone! ${count} pages indexed in database.`);
    db.close();
}
main().catch((err) => {
    process.stderr.write(`[mcbedrock-mcp] Indexing failed (network issue?): ${err.message}\n`);
    process.stderr.write(`[mcbedrock-mcp] Run 'npx mcbedrock-mcp index-docs' manually when online.\n`);
    process.exit(0);
});
