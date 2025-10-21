#!/usr/bin/env node

import { downloadWiki } from "./index.js";

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log("Usage: deepwiki-dl <repoName> [outDir]");
  console.log("");
  console.log("Examples:");
  console.log("  deepwiki-dl modelcontextprotocol/typescript-sdk");
  console.log("  deepwiki-dl modelcontextprotocol/typescript-sdk ./my-output");
  console.log("");
  console.log("Arguments:");
  console.log("  repoName    GitHub repository in format 'owner/repo'");
  console.log("  outDir      Output directory (default: {repo-name}-deepwiki/)");
  process.exit(args[0] === "--help" || args[0] === "-h" ? 0 : 1);
}

const repoName = args[0];
const outDir = args[1];

try {
  await downloadWiki(repoName, outDir);
  console.log("✓ Download complete!");
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
