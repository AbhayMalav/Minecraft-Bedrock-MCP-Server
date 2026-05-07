# mcbedrock-mcp

A Model Context Protocol (MCP) server that gives AI assistants access to Minecraft Bedrock Edition scripting and addon documentation.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Build
```bash
npm run build
```

### 3. Index documentation (run once)
```bash
npm run index-docs
```

### 4. Test it works
```bash
npm start
```
You should see: `[mcbedrock-mcp] Server started and ready.`
Press Ctrl+C.

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mcbedrock": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcbedrock-mcp/dist/src/index.js"]
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/` with the real path to this project folder.

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_bedrock_docs` | Full-text search across all indexed Bedrock docs |
| `get_bedrock_example` | Get code examples for a specific scripting topic |
| `explain_bedrock_concept` | Get an explanation of a Bedrock addon concept |

## Adding More Docs

Edit `config.json` and add entries to the `sources` array, then run `npm run rebuild-db`.