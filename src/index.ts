#!/usr/bin/env node
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

const configPath = path.resolve(__dirname, "../../config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const db = openDb(path.resolve(__dirname, "../../" + config.dbPath));

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[mcbedrock-mcp] Server started and ready.\n");
}

main().catch((err) => {
  process.stderr.write(`[mcbedrock-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});