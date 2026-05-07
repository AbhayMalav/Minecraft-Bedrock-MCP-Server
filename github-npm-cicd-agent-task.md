# AGENT TASK: Set Up GitHub Repo + npm Publish + CI/CD Pipeline for `mcbedrock-mcp`

## Context
The `mcbedrock-mcp` project has already been built locally. It is a TypeScript MCP server at the path `./mcbedrock-mcp/`. Your job is to:
1. Prepare the project for npm publishing (fix package.json, add .gitignore, add postinstall)
2. Initialize a Git repository and push it to GitHub
3. Add a GitHub Actions CI/CD pipeline that auto-publishes to npm whenever a new version tag is pushed

The user is doing this for the FIRST TIME. Be explicit about every command and what it does.

---

## PRE-FLIGHT: What the User Must Do Manually (Before Running You)

These CANNOT be automated — tell the user to do these BEFORE running this agent task:

### A. Create an npm account
1. Go to https://www.npmjs.com/signup
2. Create a free account (remember your username — you'll need it)
3. Verify your email address (npm won't let you publish without it)
4. Enable 2FA (Two-Factor Authentication) — go to Account Settings → Security

### B. Create a GitHub account (if not already done)
1. Go to https://github.com/signup
2. Create a free account (remember your username)

### C. Install Git (if not already installed)
- Windows: https://git-scm.com/download/win → download and install
- Check it works: `git --version`

### D. Configure Git with your identity (run in terminal):
```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

### E. Create an empty GitHub repository
1. Go to https://github.com/new
2. Name it: `mcbedrock-mcp`
3. Set it to PUBLIC
4. DO NOT initialize with README, .gitignore, or license (we'll add these)
5. Click "Create repository"
6. Copy the SSH or HTTPS URL (looks like: https://github.com/YOUR_USERNAME/mcbedrock-mcp.git)

### F. Generate an npm Automation Token
1. Go to https://www.npmjs.com → click your profile picture → "Access Tokens"
2. Click "Generate New Token" → choose "Automation" type
3. Copy the token (starts with `npm_...`) — you'll only see it once
4. Save it somewhere safe temporarily

### G. Add the npm token to GitHub Secrets
1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: paste the token from step F
5. Click "Add secret"

---

## STEP 1 — Navigate to the Project

```bash
cd mcbedrock-mcp
```

Confirm you are in the right folder:
```bash
ls
# Expected: config.json  package.json  tsconfig.json  src/  scripts/  data/  dist/
```

---

## STEP 2 — Update `package.json` for npm Publishing

Replace the `package.json` with the following. IMPORTANT: preserve the `dependencies` and `devDependencies` fields that already exist — only update the fields shown here.

The fields to update/add:

```json
{
  "name": "mcbedrock-mcp",
  "version": "1.0.0",
  "description": "MCP server for Minecraft Bedrock Edition scripting and addon documentation. Gives AI assistants access to Bedrock scripting API docs via search tools.",
  "main": "dist/src/index.js",
  "bin": {
    "mcbedrock-mcp": "./dist/src/index.js"
  },
  "files": [
    "dist/",
    "config.json",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "index-docs": "ts-node scripts/indexDocs.ts",
    "start": "node dist/src/index.js",
    "rebuild-db": "node -e \"const fs=require('fs');if(fs.existsSync('./data/bedrock-docs.db'))fs.unlinkSync('./data/bedrock-docs.db');\" && npm run index-docs",
    "postinstall": "node dist/scripts/indexDocs.js",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "minecraft",
    "bedrock",
    "mcp",
    "model-context-protocol",
    "scripting",
    "addon",
    "ai",
    "claude",
    "opencode"
  ],
  "author": "YOUR_NPM_USERNAME",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_GITHUB_USERNAME/mcbedrock-mcp.git"
  },
  "bugs": {
    "url": "https://github.com/YOUR_GITHUB_USERNAME/mcbedrock-mcp/issues"
  },
  "homepage": "https://github.com/YOUR_GITHUB_USERNAME/mcbedrock-mcp#readme",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

IMPORTANT: Replace `YOUR_NPM_USERNAME` and `YOUR_GITHUB_USERNAME` with the actual usernames.

After updating, merge back the `dependencies` and `devDependencies` that already existed in the file.

---

## STEP 3 — Fix the postinstall Script

The `postinstall` script runs `dist/scripts/indexDocs.js` after `npx mcbedrock-mcp` is used.
But `indexDocs.ts` currently imports from `../src/db.js` — when compiled this becomes `../src/db.js` which works in dist. 

We need to make the indexer SILENT and NON-BLOCKING for postinstall (it shouldn't fail the install if internet is down).

Update `scripts/indexDocs.ts` — wrap the entire `main()` call at the bottom with error handling:

Find this at the bottom of the file:
```typescript
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

Replace with:
```typescript
main().catch((err) => {
  // Don't crash postinstall if network is unavailable
  process.stderr.write(`[mcbedrock-mcp] Indexing failed (network issue?): ${err.message}\n`);
  process.stderr.write(`[mcbedrock-mcp] Run 'npx mcbedrock-mcp index-docs' manually when online.\n`);
  process.exit(0); // Exit 0 so npm install doesn't fail
});
```

---

## STEP 4 — Create `.gitignore`

Create a file named `.gitignore` in the project root:

```
# Dependencies
node_modules/

# Build output — will be generated, but we DO commit dist/ for npm
# Uncomment the line below if you want to exclude dist from git (CI will build it)
# dist/

# Generated database — users generate their own
data/

# OS files
.DS_Store
Thumbs.db

# Environment variables (if you add any later)
.env
.env.local

# TypeScript cache
*.tsbuildinfo
```

NOTE: We keep `dist/` committed to Git so the postinstall script works immediately after `npm install` without requiring the user to run `npm run build` themselves.

---

## STEP 5 — Create `.npmignore`

This tells npm what NOT to include in the published package (keeps the package small):

```
# Source files (we only ship compiled dist/)
src/
scripts/
*.ts

# Dev config
tsconfig.json
.github/

# Test files (if any added later)
test/
*.test.js
*.spec.js

# Local data
data/

# OS files
.DS_Store
Thumbs.db

# Git
.gitignore
```

---

## STEP 6 — Update the README

Replace the full content of `README.md` with this:

```markdown
# mcbedrock-mcp

> A Model Context Protocol (MCP) server that gives AI coding assistants real-time access to **Minecraft Bedrock Edition** scripting and addon documentation.

Works with Claude Desktop, OpenCode, Cursor, and any MCP-compatible client.

[![npm version](https://img.shields.io/npm/v/mcbedrock-mcp.svg)](https://www.npmjs.com/package/mcbedrock-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What It Does

Exposes three MCP tools your AI assistant can call:

| Tool | Description |
|------|-------------|
| `search_bedrock_docs` | Full-text search across Bedrock scripting docs |
| `get_bedrock_example` | Get code examples for a specific topic |
| `explain_bedrock_concept` | Get plain-English explanations of concepts |

## Quick Start (via npx — no install needed)

### OpenCode (`opencode.json`)

```json
{
  "mcp": {
    "mcbedrock": {
      "type": "local",
      "command": ["npx", "-y", "mcbedrock-mcp"]
    }
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mcbedrock": {
      "command": "npx",
      "args": ["-y", "mcbedrock-mcp"]
    }
  }
}
```

## Manual Install (optional)

```bash
npm install -g mcbedrock-mcp
```

## Updating the Documentation Database

The docs are indexed automatically on install. To re-index manually:

```bash
npx mcbedrock-mcp index-docs
```

## Adding More Doc Sources

Clone the repo, add URLs to `config.json` under `sources`, rebuild, and publish a new version.

## Development

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/mcbedrock-mcp
cd mcbedrock-mcp
npm install
npm run build
npm run index-docs
npm start
```

## License

MIT
```

Replace `YOUR_GITHUB_USERNAME` with the actual GitHub username.

---

## STEP 7 — Build the Project One Final Time

```bash
npm run build
```

Expected: no TypeScript errors. The `dist/` folder should be updated.

Verify:
```bash
ls dist/src/
# Expected: index.js  db.js  tools/
ls dist/scripts/
# Expected: indexDocs.js
```

---

## STEP 8 — Initialize Git and Push to GitHub

Run these commands IN ORDER. Replace `YOUR_GITHUB_USERNAME` with the actual username:

```bash
# Initialize git repo
git init

# Stage all files (gitignore will exclude node_modules, data/)
git add .

# Check what's being committed — verify node_modules is NOT listed
git status

# First commit
git commit -m "feat: initial release of mcbedrock-mcp v1.0.0"

# Rename branch to main (GitHub default)
git branch -M main

# Connect to GitHub (replace YOUR_GITHUB_USERNAME)
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/mcbedrock-mcp.git

# Push to GitHub
git push -u origin main
```

If you get an authentication error on the push step, GitHub may ask you to log in.
- Use your GitHub username and a **Personal Access Token** (NOT your password)
- Generate one at: https://github.com/settings/tokens → "Generate new token (classic)" → check `repo` scope

---

## STEP 9 — Create the GitHub Actions CI/CD Pipeline

Create this exact folder and file structure:

```bash
mkdir -p .github/workflows
```

Create the file `.github/workflows/publish.yml` with this content:

```yaml
name: Build, Test & Publish to npm

# Trigger: runs when you push a tag like v1.0.0, v1.2.3, etc.
on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    
    permissions:
      contents: write   # needed to create GitHub Release
      id-token: write   # needed for npm provenance
    
    steps:
      # 1. Check out the code
      - name: Checkout repository
        uses: actions/checkout@v4

      # 2. Set up Node.js 20
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
          cache: 'npm'

      # 3. Install dependencies
      - name: Install dependencies
        run: npm ci --ignore-scripts
        # ignore-scripts prevents postinstall from running in CI (no point indexing docs in CI)

      # 4. Build TypeScript
      - name: Build
        run: npm run build

      # 5. Verify the build output exists
      - name: Verify build
        run: |
          test -f dist/src/index.js || (echo "ERROR: dist/src/index.js not found!" && exit 1)
          test -f dist/scripts/indexDocs.js || (echo "ERROR: dist/scripts/indexDocs.js not found!" && exit 1)
          echo "Build verified successfully"

      # 6. Create a GitHub Release with auto-generated notes
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          make_latest: 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # 7. Publish to npm
      - name: Publish to npm
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## STEP 10 — Commit and Push the Workflow

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflow for npm auto-publish"
git push origin main
```

---

## STEP 11 — Do Your First Manual npm Publish (Local Test)

Before relying on CI, publish once manually to claim your package name and verify everything works.

```bash
# Login to npm (will open browser for 2FA)
npm login

# Dry run first — see what would be published WITHOUT actually publishing
npm publish --dry-run

# Review the output — confirm dist/ and config.json are included
# Confirm src/, data/, node_modules/ are NOT included

# If it all looks good, publish for real
npm publish --access public
```

Expected output:
```
npm notice Publishing to https://registry.npmjs.org/
npm notice name:          mcbedrock-mcp
npm notice version:       1.0.0
+ mcbedrock-mcp@1.0.0
```

---

## STEP 12 — Tag the Release and Trigger CI

After the manual publish confirms everything works, tag the release. This also triggers the GitHub Actions workflow for future releases:

```bash
# Create a version tag
git tag v1.0.0

# Push the tag to GitHub
git push origin v1.0.0
```

Go to your GitHub repo → Actions tab. You should see the workflow running.
Go to your GitHub repo → Releases. A release named "v1.0.0" should appear automatically.

---

## STEP 13 — How to Publish Future Updates (The New Workflow)

Every time you update the MCP in the future, follow this exact pattern:

```bash
# 1. Make your code changes

# 2. Rebuild
npm run build

# 3. Bump the version (choose one):
npm version patch   # 1.0.0 → 1.0.1 (bug fix)
npm version minor   # 1.0.0 → 1.1.0 (new feature)
npm version major   # 1.0.0 → 2.0.0 (breaking change)
# This automatically commits the version bump AND creates a tag

# 4. Push commits AND the new tag
git push origin main --follow-tags

# That's it! GitHub Actions will:
# → Build the project
# → Create a GitHub Release with auto-generated changelog
# → Publish the new version to npm automatically
```

Users who use `npx mcbedrock-mcp` will automatically get the latest version.
Users who installed globally with `npm install -g` can run `npm update -g mcbedrock-mcp`.

---

## STEP 14 — Final Verification Checklist

After all steps are complete, verify:

- [ ] `https://www.npmjs.com/package/mcbedrock-mcp` exists and shows version 1.0.0
- [ ] `https://github.com/YOUR_USERNAME/mcbedrock-mcp` is public and has all files
- [ ] `.github/workflows/publish.yml` is visible in the repo
- [ ] GitHub repo Settings → Secrets → `NPM_TOKEN` is listed (value hidden)
- [ ] Test npx works from a DIFFERENT folder: 
  ```bash
  cd /tmp
  npx mcbedrock-mcp
  # Should start the server and show: [mcbedrock-mcp] Server started and ready.
  ```
- [ ] Add the following to an `opencode.json` and confirm the AI can use the tools:
  ```json
  {
    "mcp": {
      "mcbedrock": {
        "type": "local",
        "command": ["npx", "-y", "mcbedrock-mcp"]
      }
    }
  }
  ```

---

## IMPORTANT CONSTRAINTS

1. **Never commit `data/bedrock-docs.db`** — it's user-generated and in .gitignore
2. **Never commit `node_modules/`** — always in .gitignore
3. **Always use `npm run build` before tagging** — the CI rebuilds but local dist/ should also be fresh
4. **The `NPM_TOKEN` secret must be "Automation" type** — "Publish" type requires 2FA interaction which breaks CI
5. **Package name must be globally unique on npm** — if `mcbedrock-mcp` is taken, use `@YOUR_NPM_USERNAME/mcbedrock-mcp` (scoped package) and update all references

