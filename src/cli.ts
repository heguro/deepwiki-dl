#!/usr/bin/env node

import { downloadWiki } from "./index.js";

const args = process.argv.slice(2);
const commandName = "deepwiki-dl";

if (args.length === 0 || !args[0].trim() || args[0] === "--help" || args[0] === "-h") {
  console.log(`Usage: ${commandName} owner/repo [outDir]

Examples:
  ${commandName} modelcontextprotocol/typescript-sdk
  ${commandName} modelcontextprotocol/typescript-sdk ./my-output

Arguments:
  owner/repo    GitHub repository (e.g., modelcontextprotocol/typescript-sdk)
  outDir        Output directory (default: {repo-name}-deepwiki/)`);
  process.exit(args[0] === "--help" || args[0] === "-h" ? 0 : 1);
}

const repoName = args[0];
const outDir = args[1];

try {
  await downloadWiki(repoName, outDir);
  console.log("Download complete!");
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
