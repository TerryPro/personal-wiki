---
name: second-brain-query
description: >
  Answer questions against the knowledge base wiki. Use when the user
  asks a question about their collected knowledge, wants to explore
  connections between topics, says "what do I know about X", or wants
  to search their wiki.
allowed-tools: read grep find ls
---

# Second Brain — Query

Answer questions by searching and synthesizing knowledge from the wiki.

## Search Strategy

### 1. Start with the index

Read `wiki/index.md` to identify relevant pages. Scan all category sections (Sources, Entities, Concepts, Synthesis) for entries related to the question.

### 2. Use grep for large wikis

When the wiki has grown beyond ~100 pages and scanning the index becomes inefficient, use the `grep` tool to search key terms across `wiki/`.

### 3. Read relevant pages

Read the wiki pages identified by the index or search. Follow `[[wikilinks]]` to pull in related context from linked pages. Read enough pages to give a thorough answer, but don't read the entire wiki.

### 4. Check raw sources if needed

If the wiki pages don't fully answer the question, check relevant source summaries in `wiki/sources/` for additional detail. Only go to files in `raw/` as a last resort.

## Synthesize the Answer

### Format

Match the answer format to the question:
- **Factual question** → direct answer with citations
- **Comparison** → table or structured comparison
- **Exploration** → narrative with linked concepts
- **List/catalog** → bulleted list with brief descriptions

### Citations

Always cite wiki pages using the path-form wikilink `[[category/file-name|显示标题]]`. Example:

> 根据 [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完整指南]]，关键发现是 X。这与 [[concepts/compounding-knowledge|知识复利]] 描述的更广泛模式相呼应。

### Offer to save valuable answers

If the answer produces something worth keeping — a comparison, analysis, new connection, or synthesis — offer to save it:

> "这个对比分析值得沉淀进知识库，要不要保存为 synthesis 页？"

Saving happens only with human approval (in the wiki-viewer flow, via the review gate or the "保存到 output/" action). When approved and running with write access:
1. Create a new page in `wiki/synthesis/` with proper frontmatter
2. Add an entry to `wiki/index.md` under Synthesis
3. Append to `wiki/log.md`: `## [YYYY-MM-DD] query | Question summary`

## Conventions

- **Search the wiki first.** Only go to raw sources if the wiki doesn't have the answer.
- **Cite your sources.** Every factual claim should link to the wiki page it came from.
- **Valuable answers compound.** Encourage saving good analyses back into the wiki.
- Answers are written in Simplified Chinese; proper nouns and technical terms stay in their original form.

## Related Skills

- `/second-brain-ingest` — process new sources into wiki pages
- `/second-brain-lint` — health-check the wiki for issues
