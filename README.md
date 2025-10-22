# deepwiki-dl

Download deepwiki.com content as separate Markdown files using the deepwiki MCP server.

## Why?

The deepwiki MCP server's `read_wiki_contents` tool returns all pages concatenated together with `# Page: [title]` delimiters (without newlines before them). This bursts coding AI's context usage.

This tool splits the combined content into separate, properly numbered Markdown files based on the structure, making it easier to:
- Read only the parts you (the AI) want
- Minimize context usage

## Installation

```bash
npm install -g @heguro/deepwiki-dl
# or use with npx
npx @heguro/deepwiki-dl owner/repo [outDir]
```

## Usage

```bash
deepwiki-dl owner/repo [outDir]
```

### Arguments

- `owner/repo` - GitHub repository (e.g., `modelcontextprotocol/typescript-sdk`)
- `outDir` - Optional output directory. Defaults to `{repo-name}-deepwiki/`

### Examples

Download documentation for the MCP TypeScript SDK:

```bash
deepwiki-dl modelcontextprotocol/typescript-sdk
```

This will create a directory `typescript-sdk-deepwiki/` with:

- `_wiki_structure.md` - The structure from `read_wiki_structure`
- `1 Overview.md` - Individual pages with proper numbering
- `1.1 Installation and Setup.md`
- `1.2 Core Concepts.md`
- `2 Architecture.md`
- etc.

Specify a custom output directory:

```bash
deepwiki-dl modelcontextprotocol/typescript-sdk ./my-docs
```

## How it works

This tool connects to the deepwiki MCP server at `https://mcp.deepwiki.com/mcp` and:

1. Calls `read_wiki_structure` to get the table of contents with numbered sections
2. Calls `read_wiki_contents` to get all page content in a single string
3. Parses the content which comes in format `# Page: [title]\n\n[content]`
4. Matches page titles with the structure to determine proper numbering
5. Saves each page as a separate Markdown file with format `N [title].md` or `N.N [title].md`

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Lint
pnpm run lint

# Format
pnpm run format
```

## License

[CC0-1.0](LICENSE) - Public Domain
