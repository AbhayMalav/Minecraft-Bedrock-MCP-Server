#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_js_1 = require("./db.js");
const searchDocs_js_1 = require("./tools/searchDocs.js");
const getExample_js_1 = require("./tools/getExample.js");
const explainConcept_js_1 = require("./tools/explainConcept.js");
const configPath = path_1.default.resolve(__dirname, "../../config.json");
const config = JSON.parse(fs_1.default.readFileSync(configPath, "utf-8"));
const db = (0, db_js_1.openDb)(path_1.default.resolve(__dirname, "../../" + config.dbPath));
const rowCount = db.prepare("SELECT COUNT(*) as c FROM docs").get().c;
if (rowCount === 0) {
    process.stderr.write("[mcbedrock-mcp] WARNING: Database is empty. Run 'npm run index-docs' first.\n");
}
const server = new index_js_1.Server({
    name: "mcbedrock-mcp",
    version: "1.0.0",
}, {
    capabilities: { tools: {} },
});
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "search_bedrock_docs",
            description: "Search Minecraft Bedrock Edition scripting and addon documentation. Use this for any questions about the @minecraft/server API, behavior packs, resource packs, entities, items, blocks, or events.",
            inputSchema: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Search keywords. E.g. 'PlayerJoinAfterEvent', 'world.sendMessage', 'ItemStack', 'entity behavior'",
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
            description: "Get code examples for a Minecraft Bedrock scripting topic. Returns actual TypeScript/JavaScript code blocks from the documentation.",
            inputSchema: {
                type: "object",
                properties: {
                    topic: {
                        type: "string",
                        description: "The scripting topic you need an example for. E.g. 'http request', 'subscribe to event', 'spawn entity', 'ItemStack constructor'",
                    },
                },
                required: ["topic"],
            },
        },
        {
            name: "explain_bedrock_concept",
            description: "Get a plain-English explanation of a Minecraft Bedrock addon or scripting concept. Best for architecture questions, concepts, and terminology.",
            inputSchema: {
                type: "object",
                properties: {
                    concept: {
                        type: "string",
                        description: "The concept to explain. E.g. 'behavior pack manifest', 'Script API vs Add-On', 'game loop tick', 'ScriptEventSource'",
                    },
                },
                required: ["concept"],
            },
        },
    ],
}));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
        let text = "";
        if (name === "search_bedrock_docs") {
            const limit = Math.min(args?.limit || 5, 10);
            text = (0, searchDocs_js_1.handleSearchDocs)(db, args?.query, limit);
        }
        else if (name === "get_bedrock_example") {
            text = (0, getExample_js_1.handleGetExample)(db, args?.topic);
        }
        else if (name === "explain_bedrock_concept") {
            text = (0, explainConcept_js_1.handleExplainConcept)(db, args?.concept);
        }
        else {
            return {
                content: [{ type: "text", text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }
        return { content: [{ type: "text", text }] };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            content: [{ type: "text", text: `Tool error: ${message}` }],
            isError: true,
        };
    }
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("[mcbedrock-mcp] Server started and ready.\n");
}
main().catch((err) => {
    process.stderr.write(`[mcbedrock-mcp] Fatal error: ${err}\n`);
    process.exit(1);
});
