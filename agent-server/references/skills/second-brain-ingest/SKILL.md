---
name: second-brain-ingest
description: >
  Process raw source documents into wiki pages. Use when the user adds
  files to raw/ and wants them ingested, says "process this source",
  "ingest this article", "I added something to raw/", or wants to
  incorporate new material into their knowledge base.
allowed-tools: read write edit grep find ls
---

# Second Brain — Ingest

Process raw source documents into structured, interlinked wiki pages.

## Identify Sources to Process

Determine which files need ingestion:

1. If the user specifies a file or files, use those
2. If the user says "process new sources" or similar, detect unprocessed files:
   - List all files in `raw/` (excluding `raw/assets/`)
   - Read `wiki/log.md` and extract all previously ingested source filenames from `ingest` entries
   - Any file in `raw/` not listed in the log is unprocessed
3. If no unprocessed files are found, tell the user

## Process Each Source

For each source file, follow this workflow:

### 1. Read the source completely

Read the entire file. If the file contains image references, note them — read the images separately if they contain important information.

### 2. Note key takeaways

Identify the 3-5 most important takeaways from the source and mention them at the beginning of your final report. Do NOT pause to ask for confirmation: ingestion runs in one pass, and a human reviews the collected diff afterwards (review gate) before anything is applied to the vault.

### 3. Create source summary page

Create a new file in `wiki/sources/` named after the source (slugified). Include:

    ---
    tags: [relevant, tags]
    sources: [original-filename.md]
    aliases: ["页面 H1 标题"]
    created: YYYY-MM-DD
    updated: YYYY-MM-DD
    ---

    # Source Title

    **来源：** original-filename.md
    **摄取日期：** YYYY-MM-DD
    **类型：** article | paper | transcript | notes | etc.

    ## 摘要

    Structured summary of the source content.

    ## 核心论断

    - Claim 1
    - Claim 2

    ## 提及实体

    - [[entities/entity-name|实体名]] — brief context

    ## 涉及概念

    - [[concepts/concept-name|概念名]] — brief context

### 4. Update entity and concept pages

For each entity (person, organization, product, tool) and concept (idea, framework, theory, pattern) mentioned in the source:

**If a wiki page already exists:**
- Read the existing page
- Add new information from this source
- Add the source to the `sources:` frontmatter list
- Update the `updated:` date
- Note any contradictions with existing content, citing both sources

**If no wiki page exists:**
- Create a new page in the appropriate subdirectory:
  - `wiki/entities/` for people, organizations, products, tools
  - `wiki/concepts/` for ideas, frameworks, theories, patterns
- Include YAML frontmatter with tags, sources, aliases, created, and updated fields
- Write a focused summary based on what this source says about the topic

### 5. Add wikilinks

Ensure all related pages link to each other, always using the path form `[[category/file-name|显示标题]]` (see AGENTS.md 链接规则). Every mention of an entity or concept that has its own page should be linked.

### 6. Update wiki/index.md

For each new page created, add an entry under the appropriate category header:

    - [[category/file-name|Page Name]] — one-line summary (under 120 characters)

### 7. Update wiki/log.md

Append:

    ## [YYYY-MM-DD] ingest | Source Title
    Processed source-filename.md. Created N new pages, updated M existing pages.
    New entities: [[entities/e1|E1]], [[entities/e2|E2]]. New concepts: [[concepts/c1|C1]].

### 8. Report results

Tell the user what was done:
- Key takeaways from the source (from step 2)
- Pages created (with links)
- Pages updated (with what changed)
- New entities and concepts identified
- Any contradictions found with existing content

## Conventions

- Source summary pages are **factual only**. Save interpretation and synthesis for concept and synthesis pages.
- A single source typically touches **10-15 wiki pages**. This is normal and expected.
- When new information contradicts existing wiki content, **update the wiki page and note the contradiction** with both sources cited.
- **Prefer updating existing pages** over creating new ones. Only create a new page when the topic is distinct enough to warrant its own page.
- All generated content in `wiki/` is written in Simplified Chinese (proper nouns / technical terms stay in their original form); never modify `raw/`.

## What's Next

After ingesting sources, the user can:
- **Ask questions** with `/second-brain-query` to explore what was ingested
- **Ingest more sources** — clip another article and run `/second-brain-ingest` again
- **Health-check** with `/second-brain-lint` after every 10 ingests to catch gaps
