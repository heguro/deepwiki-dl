import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_SERVER_URL = "https://mcp.deepwiki.com/mcp";

interface WikiStructure {
  sections: WikiSection[];
  rawText: string;
}

interface WikiSection {
  number: string;
  title: string;
  fullTitle: string; // e.g., "1.1 Installation and Setup"
}

/**
 * Parse the wiki structure output from read_wiki_structure
 * Expected format:
 * - 1 Overview
 *   - 1.1 Installation and Setup
 *   - 1.2 Core Concepts
 * - 2 Architecture
 */
function parseWikiStructure(structureText: string): WikiStructure {
  const sections: WikiSection[] = [];
  const lines = structureText.split("\n");

  for (const line of lines) {
    // Match patterns like "- 1 Overview" or "  - 1.1 Installation and Setup"
    const match = line.match(/^\s*-\s+([\d.]+)\s+(.+)$/);
    if (match) {
      const number = match[1];
      const title = match[2].trim();
      sections.push({
        number,
        title,
        fullTitle: `${number} ${title}`,
      });
    }
  }

  return { sections, rawText: structureText };
}

/**
 * Split wiki contents into separate files based on structure
 * The contents come in the format: # Page: [title]\n\n[content]
 * We need to match titles with the structure to get proper numbering
 */
function splitWikiContents(contents: string, structure: WikiStructure): Map<string, string> {
  const files = new Map<string, string>();

  // Split by "# Page: " pattern (no newline before it)
  const pages = contents.split(/# Page: /);

  // First element is usually empty or text before first page marker
  if (pages[0].trim()) {
    // If there's content before any page marker, include it
    files.set("_preamble.md", pages[0].trim());
  }

  // Track which section index we're at for matching
  let sectionIndex = 0;

  // Process each page (skip first which was before any page marker)
  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];

    // Extract title from first line
    const firstLineEnd = page.indexOf("\n");
    if (firstLineEnd === -1) continue;

    const pageTitle = page.substring(0, firstLineEnd).trim();
    const pageContent = page.substring(firstLineEnd + 1).trim();

    // Try to match this title with structure
    // The title in pages doesn't have numbers, but structure does
    if (sectionIndex < structure.sections.length) {
      const section = structure.sections[sectionIndex];

      // Check if this page title matches the current section title
      if (section.title === pageTitle) {
        // Matched! Use the numbered filename
        const filename = `${section.number} ${pageTitle}.md`;
        files.set(filename, `# ${section.fullTitle}\n\n${pageContent}`);
        sectionIndex++;
      } else {
        // Title doesn't match expected order, save with just the title
        files.set(`${pageTitle}.md`, `# ${pageTitle}\n\n${pageContent}`);
      }
    } else {
      // Ran out of structure sections, save with just the title
      files.set(`${pageTitle}.md`, `# ${pageTitle}\n\n${pageContent}`);
    }
  }

  return files;
}

/**
 * Main function to download wiki content from deepwiki.com
 */
export async function downloadWiki(repoName: string, outDir?: string): Promise<void> {
  // Determine output directory
  const outputDir = outDir ?? `${repoName.split("/").at(-1) ?? "unknown"}-deepwiki`;

  console.log(`Downloading wiki for ${repoName}...`);
  console.log(`Output directory: ${outputDir}`);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create MCP client
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
  const client = new Client(
    {
      name: "deepwiki-dl",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  try {
    // Connect to the MCP server
    console.log("Connecting to deepwiki MCP server...");
    await client.connect(transport);

    // Call read_wiki_structure
    console.log("Fetching wiki structure...");
    const structureResult = await client.callTool({
      name: "read_wiki_structure",
      arguments: {
        repoName,
      },
    });

    // Extract text from result
    const structureContent = structureResult.content as Array<{ type: string; text?: string }>;
    const structureText =
      structureContent
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n") || "";

    // Save structure file
    const structureFile = path.join(outputDir, "_wiki_structure.md");
    fs.writeFileSync(structureFile, structureText, "utf-8");
    console.log(`Saved structure to ${structureFile}`);

    // Parse structure
    const structure = parseWikiStructure(structureText);
    console.log(`Found ${structure.sections.length} sections`);

    // Call read_wiki_contents
    console.log("Fetching wiki contents...");
    const contentsResult = await client.callTool({
      name: "read_wiki_contents",
      arguments: {
        repoName,
      },
    });

    // Extract text from result
    const contentsContent = contentsResult.content as Array<{ type: string; text?: string }>;
    const contentsText =
      contentsContent
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n") || "";

    // Split and save files
    const files = splitWikiContents(contentsText, structure);

    for (const [filename, content] of files.entries()) {
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, content, "utf-8");
      console.log(`Saved ${filename}`);
    }

    console.log(`\nSuccessfully saved ${files.size} files to ${outputDir}`);
  } finally {
    // Close the client connection
    await client.close();
  }
}
