import { describe, expect, it } from "vitest";
import {
  parseWikiStructure,
  replaceInvalidFilenameCharacters,
  splitWikiContents,
} from "./index.js";

describe("replaceInvalidFilenameCharacters", () => {
  it("should replace Windows-invalid characters with dash", () => {
    expect(replaceInvalidFilenameCharacters("file<name>.md")).toBe("file-name-.md");
    expect(replaceInvalidFilenameCharacters("file>name.md")).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters("file:name.md")).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters('file"name.md')).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters("file/name.md")).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters("file\\name.md")).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters("file|name.md")).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters("file?name.md")).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters("file*name.md")).toBe("file-name.md");
  });

  it("should replace control characters (U+0000-U+001F) with dash", () => {
    expect(replaceInvalidFilenameCharacters("file\u0000name.md")).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters("file\u0001name.md")).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters("file\u001Fname.md")).toBe("file-name.md");
    expect(replaceInvalidFilenameCharacters("file\tname.md")).toBe("file-name.md"); // tab is \u0009
    expect(replaceInvalidFilenameCharacters("file\nname.md")).toBe("file-name.md"); // newline is \u000A
  });

  it("should not modify valid filenames", () => {
    expect(replaceInvalidFilenameCharacters("valid-filename.md")).toBe("valid-filename.md");
    expect(replaceInvalidFilenameCharacters("file name with spaces.md")).toBe(
      "file name with spaces.md",
    );
    expect(replaceInvalidFilenameCharacters("file_name-123.md")).toBe("file_name-123.md");
  });

  it("should handle multiple invalid characters", () => {
    expect(replaceInvalidFilenameCharacters("file<>:name.md")).toBe("file---name.md");
    expect(replaceInvalidFilenameCharacters('file"|?*name.md')).toBe("file----name.md");
  });

  it("should handle empty string", () => {
    expect(replaceInvalidFilenameCharacters("")).toBe("");
  });
});

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
    const input = `Available pages for owner/repo:

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
      "Error fetching wiki for someNotFoundRepo: Repository not found. Visit https://deepwiki.com/someNotFoundRepo to index it.";

    expect(() => splitWikiContents(content, structure)).toThrow(
      `Invalid content format\n${content}`,
    );
  });

  it("should throw error when structure has no sections", () => {
    const structure = parseWikiStructure("No list items here");

    const content = `# Page: Overview

Some content here.`;

    expect(() => splitWikiContents(content, structure)).toThrow(
      `Invalid structure format\n${content}`,
    );
  });

  it("should not treat non-matching titles as page delimiters", () => {
    const structure = parseWikiStructure(`- 1 Overview
- 2 Installation`);

    const content = `# Page: Overview

Overview content.# Page: Unexpected Page

This page wasn't in the structure.# Page: Installation

Installation content.`;

    const result = splitWikiContents(content, structure);

    // Should only create files for matching structure titles
    expect(result.size).toBe(2);
    expect(result.has("1 Overview.md")).toBe(true);
    expect(result.has("2 Installation.md")).toBe(true);

    // "Unexpected Page" should be included in Overview's content
    const overviewContent = result.get("1 Overview.md");
    expect(overviewContent).toContain("Overview content.# Page: Unexpected Page");
    expect(overviewContent).toContain("This page wasn't in the structure.");
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

  it("should sanitize filenames with invalid Windows characters", () => {
    const structure = parseWikiStructure("- 1 Test:Title\n- 2 Another/Title");

    const content = `# Page: Test:Title

Content for test.# Page: Another/Title

Content for another.`;

    const result = splitWikiContents(content, structure);

    expect(result.has("1 Test-Title.md")).toBe(true);
    expect(result.has("2 Another-Title.md")).toBe(true);
    expect(result.get("1 Test-Title.md")).toBe("# 1 Test:Title\n\nContent for test.");
    expect(result.get("2 Another-Title.md")).toBe("# 2 Another/Title\n\nContent for another.");
  });
});
