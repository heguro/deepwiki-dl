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
export function parseWikiStructure(structureText: string): WikiStructure {
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
 * Sanitize invalid characters in a filename by replacing them with "-"
 * @internal For internal use only
 * @private
 * @see https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file#naming-conventions
 */
export function replaceInvalidFilenameCharacters(filename: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters are intentionally matched to sanitize filenames per Windows naming conventions
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-");
}

/**
 * Split wiki contents into separate files based on structure
 * The contents come in the format: # Page: [title]\n\n[content]
 * We need to match titles with the structure to get proper numbering
 * Only treat "# Page: [title]" as a delimiter if the title matches the next expected title in structure
 */
export function splitWikiContents(contents: string, structure: WikiStructure): Map<string, string> {
  const files = new Map<string, string>();

  // Handle empty content
  if (!contents || contents.trim() === "") {
    return files;
  }

  // Check if content starts with "# Page: " - if not, it's an error message
  if (!contents.startsWith("# Page: ")) {
    // Content before any page marker indicates an error (e.g., "Repository not found")
    throw new Error(`Invalid content format\n${contents.trim()}`);
  }

  // Check if structure has any sections - if not, it's an error
  if (structure.sections.length === 0) {
    // No sections in structure indicates an error
    throw new Error(`Invalid structure format\n${contents.trim()}`);
  }

  // Track which section index we're at for matching
  let sectionIndex = 0;
  let currentPos = 0;

  while (currentPos < contents.length && sectionIndex < structure.sections.length) {
    const section = structure.sections[sectionIndex];

    // Look for "# Page: " + section title
    const marker = `# Page: ${section.title}`;
    const markerPos = contents.indexOf(marker, currentPos);

    if (markerPos === -1) {
      // Expected section not found - we're done
      break;
    }

    // Find where this page's content ends (next matching "# Page: " or end of string)
    const contentStart = markerPos + marker.length;
    let contentEnd = contents.length;

    // Look for the next valid page marker
    for (let nextIdx = sectionIndex + 1; nextIdx < structure.sections.length; nextIdx++) {
      const nextMarker = `# Page: ${structure.sections[nextIdx].title}`;
      const nextPos = contents.indexOf(nextMarker, contentStart);
      if (nextPos !== -1) {
        contentEnd = nextPos;
        break;
      }
    }

    // Extract and clean the content
    const pageContent = contents.substring(contentStart, contentEnd).trim();

    // Save the file
    const filename = replaceInvalidFilenameCharacters(`${section.number} ${section.title}.md`);
    files.set(filename, `# ${section.fullTitle}\n\n${pageContent}`);

    currentPos = contentEnd;
    sectionIndex++;
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
      version: "0.0.1",
    },
    {
      capabilities: {},
    },
  );

  try {
    // Connect to the MCP server
    console.log("Connecting to deepwiki MCP server...");
    // @ts-expect-error https://github.com/modelcontextprotocol/typescript-sdk/issues/861
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
