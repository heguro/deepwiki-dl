import { describe, expect, it } from "vitest";
import { parseWikiStructure, splitWikiContents } from "./index.js";

describe("parseWikiStructure", () => {
  it("should parse a simple structure with top-level sections", () => {
    const input = `Available pages for test/repo:

- 1 Overview
- 2 Architecture`;

    const result = parseWikiStructure(input);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toEqual({
      number: "1",
      title: "Overview",
      fullTitle: "1 Overview",
    });
    expect(result.sections[1]).toEqual({
      number: "2",
      title: "Architecture",
      fullTitle: "2 Architecture",
    });
    expect(result.rawText).toBe(input);
  });

  it("should parse nested sections with sub-levels", () => {
    const input = `Available pages for modelcontextprotocol/typescript-sdk:

- 1 Overview
  - 1.1 Installation and Setup
  - 1.2 Core Concepts
- 2 Architecture
  - 2.1 Protocol Foundation
  - 2.2 Type System and Message Schemas`;

    const result = parseWikiStructure(input);

    expect(result.sections).toHaveLength(6);
    expect(result.sections[0]).toEqual({
      number: "1",
      title: "Overview",
      fullTitle: "1 Overview",
    });
    expect(result.sections[1]).toEqual({
      number: "1.1",
      title: "Installation and Setup",
      fullTitle: "1.1 Installation and Setup",
    });
    expect(result.sections[2]).toEqual({
      number: "1.2",
      title: "Core Concepts",
      fullTitle: "1.2 Core Concepts",
    });
    expect(result.sections[3]).toEqual({
      number: "2",
      title: "Architecture",
      fullTitle: "2 Architecture",
    });
  });

  it("should handle empty input", () => {
    const result = parseWikiStructure("");
    expect(result.sections).toHaveLength(0);
    expect(result.rawText).toBe("");
  });

  it("should ignore lines that don't match the pattern", () => {
    const input = `Some header text
- 1 Valid Section
Not a section line
  - 1.1 Valid Sub-Section
Another random line`;

    const result = parseWikiStructure(input);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe("Valid Section");
    expect(result.sections[1].title).toBe("Valid Sub-Section");
  });

  it("should handle sections with numbers containing multiple dots", () => {
    const input = "- 1.2.3 Deep Nested Section";

    const result = parseWikiStructure(input);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toEqual({
      number: "1.2.3",
      title: "Deep Nested Section",
      fullTitle: "1.2.3 Deep Nested Section",
    });
  });
});

describe("splitWikiContents", () => {
  it("should split content by page markers and match with structure", () => {
    const structure = parseWikiStructure(`- 1 Overview
- 2 Installation`);

    const content = `# Page: Overview

This is the overview content.# Page: Installation

Installation instructions here.`;

    const result = splitWikiContents(content, structure);

    expect(result.size).toBe(2);
    expect(result.get("1 Overview.md")).toBe("# 1 Overview\n\nThis is the overview content.");
    expect(result.get("2 Installation.md")).toBe(
      "# 2 Installation\n\nInstallation instructions here.",
    );
  });

  it("should handle content without newline before page marker", () => {
    const structure = parseWikiStructure(`- 1 Overview
- 2 Setup`);

    // Simulating the actual format from deepwiki where there's no newline before # Page:
    const content = `# Page: Overview

Overview content here.# Page: Setup

Setup content here.`;

    const result = splitWikiContents(content, structure);

    expect(result.has("1 Overview.md")).toBe(true);
    expect(result.has("2 Setup.md")).toBe(true);
  });

  it("should throw error when content has preamble (error message)", () => {
    const structure = parseWikiStructure("- 1 Overview");

    const content =
      "Error fetching wiki for modelcontextprotocol/typescript-sdkkkk: Repository not found. Visit https://deepwiki.com/modelcontextprotocol/typescript-sdkkkk to index it.";

    expect(() => splitWikiContents(content, structure)).toThrow(
      "Error fetching wiki for modelcontextprotocol/typescript-sdkkkk: Repository not found. Visit https://deepwiki.com/modelcontextprotocol/typescript-sdkkkk to index it.",
    );
  });

  it("should handle pages that don't match structure order", () => {
    const structure = parseWikiStructure(`- 1 Overview
- 2 Installation`);

    const content = `# Page: Overview

Overview content.# Page: Unexpected Page

This page wasn't in the structure.# Page: Installation

Installation content.`;

    const result = splitWikiContents(content, structure);

    expect(result.size).toBe(3);
    expect(result.has("1 Overview.md")).toBe(true);
    expect(result.has("Unexpected Page.md")).toBe(true); // Falls back to title-only filename
    expect(result.has("2 Installation.md")).toBe(true);
  });

  it("should handle nested section numbering", () => {
    const structure = parseWikiStructure(`- 1 Overview
  - 1.1 Installation
  - 1.2 Configuration
- 2 Advanced`);

    const content = `# Page: Overview

Overview text.# Page: Installation

Install steps.# Page: Configuration

Config details.# Page: Advanced

Advanced topics.`;

    const result = splitWikiContents(content, structure);

    expect(result.size).toBe(4);
    expect(result.has("1 Overview.md")).toBe(true);
    expect(result.has("1.1 Installation.md")).toBe(true);
    expect(result.has("1.2 Configuration.md")).toBe(true);
    expect(result.has("2 Advanced.md")).toBe(true);
  });

  it("should handle empty content", () => {
    const structure = parseWikiStructure("- 1 Overview");
    const result = splitWikiContents("", structure);

    expect(result.size).toBe(0);
  });

  it("should handle pages with only title and no content", () => {
    const structure = parseWikiStructure("- 1 Overview");
    const content = `# Page: Overview
# Page: Next`;

    const result = splitWikiContents(content, structure);

    // Should still create the file even with empty content
    expect(result.has("1 Overview.md")).toBe(true);
  });

  it("should preserve multiline content correctly", () => {
    const structure = parseWikiStructure("- 1 Guide");

    const content = `# Page: Guide

Line 1 of content.
Line 2 of content.

Line 3 after blank line.`;

    const result = splitWikiContents(content, structure);

    expect(result.get("1 Guide.md")).toBe(
      "# 1 Guide\n\nLine 1 of content.\nLine 2 of content.\n\nLine 3 after blank line.",
    );
  });

  it("should handle more pages than structure sections", () => {
    const structure = parseWikiStructure("- 1 Overview");

    const content = `# Page: Overview

Overview content.# Page: Extra Page 1

Extra content 1.# Page: Extra Page 2

Extra content 2.`;

    const result = splitWikiContents(content, structure);

    expect(result.size).toBe(3);
    expect(result.has("1 Overview.md")).toBe(true);
    expect(result.has("Extra Page 1.md")).toBe(true); // Falls back to title-only
    expect(result.has("Extra Page 2.md")).toBe(true); // Falls back to title-only
  });
});
