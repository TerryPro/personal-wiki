**TL;DR:** Andrej Karpathy's LLM Wiki is a pattern — not a product — where an LLM agent builds and maintains a structured markdown knowledge base from your raw sources. Three-layer architecture: `raw/` (immutable sources), `wiki/` (LLM-generated pages), and `CLAUDE.md` (schema). Three operations: ingest (process new sources), query (ask questions), lint (health checks). It replaces RAG with plain markdown for personal/team-scale knowledge. This guide covers the complete setup with Claude Code and Obsidian.

In April 2026, Andrej Karpathy [posted on X](https://x.com/karpathy/status/2039805659525644595) about a workflow shift: instead of using LLMs primarily for code generation, he had been using them to build personal knowledge bases. The post went viral — 16+ million views — and the [follow-up GitHub Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) hit 5,000+ stars within days. It touched a nerve because it solved a problem every knowledge worker has: knowledge bases that collapse under their own maintenance weight.

This guide breaks down the pattern, shows you how to build one from scratch with Claude Code and Obsidian, compares it to RAG, and surveys the community implementations that emerged within a week.

## Table of Contents

-   [Why Knowledge Bases Collapse](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#why-knowledge-bases-collapse)
-   [The Three-Layer Architecture](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#the-three-layer-architecture)
-   [The Three Operations: Ingest, Query, Lint](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#the-three-operations-ingest-query-lint)
-   [Setting Up Your LLM Wiki with Claude Code](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#setting-up-your-llm-wiki-with-claude-code)
-   [The Schema: Your Most Important File](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#the-schema-your-most-important-file)
-   [Using Obsidian as the Frontend](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#using-obsidian-as-the-frontend)
-   [LLM Wiki vs RAG: When to Use Which](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#llm-wiki-vs-rag-when-to-use-which)
-   [Tooling and Infrastructure](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#tooling-and-infrastructure)
-   [Community Implementations](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#community-implementations)
-   [The Intellectual Lineage](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#the-intellectual-lineage)
-   [Criticisms and Limitations](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#criticisms-and-limitations)
-   [Sources](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#sources)

## Why Knowledge Bases Collapse

Every developer has a graveyard of abandoned knowledge systems. Notion databases with 200 pages and no updates since month three. Bookmarks folders with 500 links and no summaries. Obsidian vaults with promising graphs that went stale. The problem isn't the tools — it's the maintenance cost.

Building a knowledge base has three steps: **collect** (easy), **organize** (hard), **maintain** (impossible at scale). The grunt work of filing, cross-referencing, summarizing, and updating is where systems die. Adding a single new article means reading it, creating a summary, linking it to existing concepts, updating related pages, and checking for contradictions with existing knowledge. Nobody does this consistently.

Karpathy's insight is simple: **LLMs are uniquely good at exactly this kind of bookkeeping.** They can read a document, identify key concepts, create structured summaries, generate cross-references, update indexes, and flag contradictions — tirelessly, consistently, at near-zero marginal cost. The human curates what goes in; the LLM does everything else.

> "The LLM writes and maintains all of the data of the wiki. I rarely touch it directly." — Andrej Karpathy

At the time of the post, Karpathy's wiki on a single research topic had grown to approximately **100 articles and 400,000 words** — longer than most PhD dissertations — without him writing any of it directly.

## The Three-Layer Architecture

The LLM Wiki has a deliberately simple structure:

```
my-research/
├── raw/                    # Layer 1: Immutable source documents
│   ├── articles/
│   ├── papers/
│   ├── repos/
│   ├── data/
│   ├── images/
│   └── assets/
├── wiki/                   # Layer 2: LLM-generated markdown
│   ├── index.md            # Content catalog (updated on every ingest)
│   ├── log.md              # Append-only chronological record
│   ├── overview.md
│   ├── concepts/           # Concept pages
│   ├── entities/           # Entity pages
│   ├── sources/            # Source summaries
│   └── comparisons/        # Comparison pages
├── outputs/                # Dated reports, presentations
├── CLAUDE.md               # Layer 3: Schema configuration
└── .gitignore
```

### Layer 1: Raw Sources (`raw/`)

Your curated collection of source documents — articles, papers, code repos, datasets, images. The LLM reads these but **never modifies them**. They serve as the verification baseline: every claim in the wiki traces back to a file in `raw/`.

Think of `raw/` as immutable input. You can use the [Obsidian Web Clipper](https://obsidian.md/clipper) browser extension to convert web articles to markdown and drop them directly into `raw/articles/`.

### Layer 2: The Wiki (`wiki/`)

LLM-generated markdown pages organized by type:

-   **`concepts/`** — Concept pages (e.g., `attention-mechanism.md`, `rag.md`)
-   **`entities/`** — Entity pages (e.g., `openai.md`, `anthropic.md`)
-   **`sources/`** — Source summaries (one per ingested document)
-   **`comparisons/`** — Comparison pages (e.g., `rag-vs-fine-tuning.md`)

Two structural files are critical:

-   **`index.md`** — Content catalog. Updated on every ingest. The LLM reads this first to navigate the wiki.
-   **`log.md`** — Append-only operation log. Records every ingest, every page update, every contradiction found.

The LLM maintains everything in this directory. Humans mostly read; the LLM mostly writes.

### Layer 3: The Schema (`CLAUDE.md`)

The most important file in the system. It defines the wiki's structure, naming conventions, page templates, and operational workflows. It transforms a generic LLM into a disciplined knowledge worker.

Named `CLAUDE.md` because Karpathy uses Claude Code as his primary agent, but the concept applies to any LLM agent with file access.

## The Three Operations: Ingest, Query, Lint

The LLM Wiki pattern defines three core operations. Karpathy frames the system using a compiler analogy: `raw/` is source code, the LLM is the compiler, `wiki/` is the executable output, lint is tests, and queries are runtime.

### Ingest

You drop a new source into `raw/` and tell the LLM to process it.

```
> I added a new article to raw/articles/. Please ingest it.
```

The LLM:

1.  Reads the document and discusses key takeaways
2.  Creates a summary page in `wiki/sources/`
3.  Cascades updates across 10-15 related wiki pages
4.  Creates new concept or entity pages if needed
5.  Updates `index.md` with new entries
6.  Appends to `log.md` with affected pages and noteworthy findings

A single ingest operation can touch dozens of wiki pages as the LLM traces implications across the knowledge graph.

### Query

You ask questions against the wiki. The LLM searches `index.md`, reads relevant pages, and synthesizes answers with `[[wiki-link]]` citations.

```
> What are the key differences between sparse and dense retrieval?
```

The LLM navigates via the index instead of brute-force loading all documents into context. Valuable answers optionally get filed as permanent wiki pages — **knowledge compounds**.

### Lint

Periodic health checks. The LLM scans for:

-   **Contradictions** — claims that conflict between pages
-   **Orphan pages** — wiki pages with no incoming links
-   **Missing concepts** — topics referenced but not yet given their own page
-   **Stale claims** — assertions superseded by newer sources
-   **Investigation gaps** — areas where more research is needed

Think of it as `eslint` for knowledge. You can schedule lint operations (daily, weekly) or run them ad hoc.

```
> Please lint the wiki. Focus on contradictions and stale claims.
```

## Setting Up Your LLM Wiki with Claude Code

### Step 1: Create the directory structure

```
mkdir -p ~/research/my-topic/{raw/{articles,papers,repos,data,images},wiki/{concepts,entities,sources,comparisons},outputs}
touch ~/research/my-topic/wiki/index.md
touch ~/research/my-topic/wiki/log.md
```

### Step 2: Initialize Git

```
cd ~/research/my-topic
git init
echo "outputs/*.pdf" >> .gitignore
```

Version control is essential. Every wiki update becomes a trackable diff. You can revert bad ingests, review how concepts evolved, and use `git log` as an audit trail.

### Step 3: Create the CLAUDE.md schema

This is the critical step. See the [full schema section](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide#the-schema-your-most-important-file) below for a complete template.

### Step 4: Add your first sources

Drop markdown files, PDFs, or code into `raw/`. Use the Obsidian Web Clipper or a tool like [Markdownload](https://github.com/deathau/markdownload) to convert web articles.

### Step 5: Run Claude Code and ingest

```
cd ~/research/my-topic
claude
```

```
> I've added 3 articles to raw/articles/. Please ingest them all,
> create wiki pages, and update the index.
```

Claude Code will read each source, create structured wiki pages, establish cross-references, and update the index — all in a single operation.

## The Schema: Your Most Important File

The schema file (`CLAUDE.md`) is what makes the pattern work. Without it, the LLM produces inconsistent output. With it, the LLM becomes a reliable knowledge worker. Here is a production-ready template:

```
# Research Wiki: [Your Topic]

## Project Structure

- `raw/` — Immutable source documents. Never modify files here.
- `wiki/` — LLM-generated and maintained markdown pages.
- `wiki/index.md` — Master content catalog. Update on every operation.
- `wiki/log.md` — Append-only operation log.
- `outputs/` — Generated reports, presentations, lint results.

## Page Types and Conventions

Every wiki page must have YAML frontmatter:

    ---
    title: Page Title
    type: concept | entity | source-summary | comparison
    sources:
      - raw/papers/filename.md
    related:
      - "[[related-concept]]"
    created: YYYY-MM-DD
    updated: YYYY-MM-DD
    confidence: high | medium | low
    ---

### Naming

- Filenames: kebab-case matching the concept (e.g., attention-mechanism.md)
- Cross-references: use [[wikilinks]] for all internal links
- Source references: always link back to raw/ file paths

## Workflows

### Ingest

1. Read the source document in raw/
2. Discuss key takeaways with the user
3. Create wiki/sources/[source-name].md summary
4. Update or create concept/entity pages as needed
5. Update wiki/index.md with new entries
6. Append to wiki/log.md

### Query

1. Read wiki/index.md to identify relevant pages
2. Read those pages and synthesize an answer
3. Cite sources using [[wikilinks]]
4. If the answer is novel and valuable, offer to save it as a new wiki page

### Lint

1. Scan all wiki pages for contradictions
2. Identify orphan pages (no incoming links)
3. Flag missing concepts referenced but not created
4. Find stale claims superseded by newer sources
5. Save results to outputs/lint-YYYY-MM-DD.md
```

Customize this template for your domain. A machine learning wiki might add conventions for tracking paper citations and benchmark results. A competitive intelligence wiki might add conventions for confidence levels and source freshness.

## Using Obsidian as the Frontend

Obsidian is the recommended frontend for viewing and navigating the wiki. Open the `wiki/` directory as an Obsidian vault and you get:

### Graph View

Every `[[wikilink]]` the LLM creates becomes a visible connection in Obsidian's graph view. As the wiki grows, the graph reveals natural knowledge clusters — which concepts are central, which are isolated, where the gaps are.

### Backlinks

Click any wiki page and see every other page that references it. This is enormously valuable for understanding how concepts connect without having to manually maintain relationship lists.

### Dataview Queries

If you install the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin, you can query across all wiki pages:

````
```dataview
TABLE type, confidence, updated
FROM "concepts"
WHERE confidence = "low"
SORT updated ASC
```
````

This query surfaces your least-confident knowledge — the areas where more research is needed.

### QMD for Search

Tobi Lutke (Shopify CEO) built [QMD](https://github.com/tobi/qmd), a local search engine for markdown files. It uses hybrid BM25/vector search with LLM re-ranking. Karpathy recommends it as the search layer for LLM Wikis. It's available as both a CLI and an MCP server, so Claude Code can use it to navigate large wikis efficiently.

## LLM Wiki vs RAG: When to Use Which

This is the biggest conceptual distinction in the pattern. Karpathy positions the LLM Wiki as a simpler alternative to RAG for personal and team-scale knowledge.

|Dimension|RAG|LLM Wiki|
|---|---|---|
|**State**|Stateless — each query is independent|Stateful — knowledge compounds over time|
|**Infrastructure**|Vector DB, embedding pipeline, retrieval logic|Folder of `.md` files|
|**Cross-references**|Discovered ad-hoc per query|Pre-built by the LLM, always available|
|**Maintenance**|Embedding updates, index rebuilds|LLM updates pages on every ingest|
|**Token cost per query**|High (retrieve + re-rank + generate)|Low (read index + targeted pages)|
|**Traceability**|Chunk-level citations (often lossy)|Source-level citations back to `raw/`|
|**Scale sweet spot**|Enterprise (millions of documents)|Personal/team (sub-100K tokens of wiki)|
|**Contradictions**|Undetected — conflicting chunks coexist|Flagged during lint operations|

### When RAG wins

-   You have millions of documents and can't pre-compile them all
-   Documents change frequently and re-ingesting the entire wiki is impractical
-   You need sub-second query latency at scale
-   Your knowledge base is shared across many teams with different access levels

### When LLM Wiki wins

-   You have fewer than ~100-200 source documents
-   You want knowledge to compound — each ingested source improves all future queries
-   You care about traceability (every claim links to a raw source)
-   You want zero infrastructure beyond a folder and an LLM
-   You value consistency checks (lint) over raw retrieval speed

The LLM Wiki is essentially a **manual, traceable implementation of Graph RAG** — each claim links back to sources, relationships are explicit, and the structure is human-readable. But unlike Graph RAG, it requires no graph database, no entity extraction pipeline, and no ontology engineering.

\> Mermaid Editor

Visualize your LLM Wiki's knowledge graph structure with interactive Mermaid diagrams — export them as SVGs for documentation or presentations.

[\[Try Free\]](https://mermaideditor.io/)

## Tooling and Infrastructure

### Minimum Viable Stack

|Tool|Purpose|Required?|
|---|---|---|
|Claude Code (or any LLM agent)|Wiki compiler — reads sources, generates pages|Yes|
|A folder|Storage for `raw/`, `wiki/`, `CLAUDE.md`|Yes|
|Git|Version control for the entire knowledge base|Recommended|

That's it. No vector database, no embedding pipeline, no cloud service. The entire system runs on markdown files and an LLM.

### Recommended Stack

|Tool|Purpose|Link|
|---|---|---|
|**Claude Code**|Primary LLM agent|[claude.ai](https://claude.ai/)|
|**Obsidian**|Wiki frontend — graph view, backlinks, search|[obsidian.md](https://obsidian.md/)|
|**QMD**|Semantic search over markdown (BM25 + vector + LLM re-rank)|[github.com/tobi/qmd](https://github.com/tobi/qmd)|
|**Obsidian Web Clipper**|Convert web articles to markdown for `raw/`|[obsidian.md/clipper](https://obsidian.md/clipper)|
|**Dataview**|Structured queries across wiki frontmatter|[Obsidian plugin](https://github.com/blacksmithgu/obsidian-dataview)|
|**Marp**|Convert markdown wiki pages to presentation slides|[marp.app](https://marp.app/)|
|**Git**|Version control and change tracking|Built-in|

### Claude Code Skills for Wiki Management

You can create Claude Code skills to standardize wiki operations:

```
# /wiki-ingest skill

Read all new files in raw/ that aren't already in wiki/sources/.
For each new file:

1. Create a summary in wiki/sources/
2. Update or create concept and entity pages
3. Update wiki/index.md
4. Append to wiki/log.md
   Report what changed.
```

```
# /wiki-lint skill

Scan the entire wiki/ directory.
Check for:

- Contradictions between pages
- Orphan pages (no incoming [[wikilinks]])
- Missing concepts (referenced but no page exists)
- Low-confidence pages that haven't been updated recently
  Save results to outputs/lint-[today's date].md
```

The community has already built several skill packages. [wiki-skills](https://github.com/kfchou/wiki-skills) and [karpathy-llm-wiki](https://github.com/Astro-Han/karpathy-llm-wiki) both provide drop-in Claude Code skills implementing the pattern.

Within a week of Karpathy's post, the community built multiple implementations. Here are the most notable:

|Project|Description|Link|
|---|---|---|
|**llmwiki**|Upload docs, connect Claude via MCP, have it write your wiki|[github.com/lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki)|
|**obsidian-wiki**|Framework for AI agents to build Obsidian wikis using the Karpathy pattern|[github.com/Ar9av/obsidian-wiki](https://github.com/Ar9av/obsidian-wiki)|
|**second-brain**|LLM-maintained personal knowledge base for Obsidian|[github.com/NicholasSpisak/second-brain](https://github.com/NicholasSpisak/second-brain)|
|**llm-wiki-compiler**|Compiles markdown knowledge files into topic-based wikis|[github.com/ussumant/llm-wiki-compiler](https://github.com/ussumant/llm-wiki-compiler)|
|**CacheZero**|One `npm install` implementation of the pattern|[Hacker News](https://news.ycombinator.com/item?id=47667723)|
|**wiki-skills**|Claude Code skills implementing the Karpathy pattern|[github.com/kfchou/wiki-skills](https://github.com/kfchou/wiki-skills)|
|**LLM Wiki v2**|Extended pattern with memory lifecycle and confidence scoring|[Gist](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2)|

### Real-World Results

User `vbarsoum` on Hacker News [shared results](https://news.ycombinator.com/item?id=47640875) from applying the pattern to three business books (~155K words): chapter-level granularity produced **210 concept pages** with approximately **4,600 cross-references** and unprompted synthesis across sources. The system wasn't just summarizing — it was identifying patterns and connections across books that the user hadn't seen.

### LLM Wiki v2: Extended Pattern

Developer `rohitg00` [extended the pattern](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2) with lessons from building an agent memory system. Key additions:

-   **Memory lifecycle:** Confidence scoring, supersession tracking, retention decay (Ebbinghaus forgetting curve)
-   **Consolidation tiers:** Working memory → episodic memory → semantic memory → procedural memory
-   **Knowledge graph structure:** Typed entities and relationship categories ("uses," "depends on," "contradicts," "supersedes")
-   **Multi-agent governance:** Shared vs private knowledge scoping for parallel agents

These extensions become relevant as wikis grow beyond ~100-200 pages, where simple index navigation starts to degrade.

## The Intellectual Lineage

Karpathy's Gist explicitly references Vannevar Bush's 1945 essay ["As We May Think"](https://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/), which described a hypothetical device called the **Memex** — a mechanical desk that would store and cross-reference all of a person's books, records, and communications with associative trails between related items.

The Memex never worked because maintenance was manual. Every cross-reference had to be created by hand. Bush imagined operators building "trails" through knowledge, but nobody actually does this at scale.

The LLM Wiki solves the maintenance problem: **"The wiki stays maintained because the cost of maintenance is near zero."** The LLM creates and updates cross-references automatically on every ingest. The human focuses on what matters — deciding what to read and what questions to ask.

### Karpathy's Evolution

The LLM Wiki represents the third phase of Karpathy's thinking about human-AI collaboration:

1.  **Vibe Coding** (Feb 2025) — Accept AI-generated code without reviewing it line-by-line. Trust the model, test the output.
2.  **Agentic Engineering** (Jan 2026) — Humans orchestrate AI agents rather than writing code directly.
3.  **LLM Knowledge Bases** (Apr 2026) — AI manages knowledge, not just code. The human is a curator, not a writer.

Each phase shifts more cognitive labor to the LLM while keeping humans in the loop for judgment and direction.

-   **Jeremy Howard's `llms.txt`** — A [website-level standard](https://llmstxt.org/) for helping external LLMs understand your site. Outward-facing (help LLMs understand you) vs the LLM Wiki's inward-facing (use LLMs to understand your domain). Both share the philosophy that markdown is the ideal format for LLM consumption.
-   **Simon Willison's `docs-for-llms`** — [Build scripts](https://github.com/simonw/docs-for-llms) to create LLM-friendly concatenated documentation. Focused on making existing docs consumable rather than having the LLM generate new knowledge.
-   **Tobi Lutke's QMD** — The [local search engine](https://github.com/tobi/qmd) Karpathy recommends. Built by the Shopify CEO, which signals adoption at the highest levels of tech leadership.

## Criticisms and Limitations

The pattern is not without critics. Key concerns from the [Hacker News discussion](https://news.ycombinator.com/item?id=47640875):

### "The grunt work IS the learning"

User `qaadika` argued that the bookkeeping Karpathy outsources — filing, cross-referencing, summarizing — is where genuine understanding forms. By handing this to an LLM, you surrender the cognitive process that creates deep knowledge. You end up with a comprehensive wiki you haven't actually internalized.

**Counter:** The wiki is a reference system, not a replacement for thinking. Karpathy still reads sources, discusses takeaways with the LLM, and makes judgment calls about what to include. The LLM handles logistics, not insight.

### Context window degradation

Multiple users reported that quality degrades when the wiki grows beyond what fits in context. Despite 1M+ token context windows, practical degradation starts around 200K-300K tokens. The LLM starts missing connections or producing inconsistent pages.

**Mitigation:** This is why the index/navigation pattern matters. Instead of loading the entire wiki, the LLM reads `index.md` (a few thousand tokens), identifies relevant pages, and reads only those. Hierarchical navigation sidesteps brute-force context stuffing.

### Model collapse risk

`devnullbrain` raised concerns about information degradation through repeated LLM rewriting — the wiki version of model collapse. Each rewrite potentially introduces subtle errors that compound over time.

**Mitigation:** The immutable `raw/` layer is the safeguard. Every claim in the wiki should trace back to a source in `raw/`. Lint operations check for drift. And Git provides full history to identify when claims changed.

### Complexity ceiling

`kubb` warned that these systems collapse beyond certain complexity thresholds when neither the agent nor the developer maintains sufficient comprehension of the whole.

**Mitigation:** This is a real constraint. The pattern works best for personal/team knowledge at the 50-200 source scale. Beyond that, you likely need the extensions from LLM Wiki v2 (hybrid search, multi-agent governance) or a proper RAG pipeline.

\> StarMorph Config

Managing CLAUDE.md schemas, dotfiles, and AI agent configs across projects? StarMorph Config keeps everything versioned and in sync.

[\[Browse Configs\]](https://starmorph.com/config)

## Sources

### Research Papers

[arXivA-MEM: Agentic Memory for LLM Agents (2025)](https://arxiv.org/abs/2502.12110)[arXivAgentic Retrieval-Augmented Generation: A Survey (2025)](https://arxiv.org/abs/2501.09136)[arXivSurvey on Knowledge-Oriented RAG (2025)](https://arxiv.org/abs/2503.10677)[arXivPersonalAI: Knowledge Graph Storage for LLM Agents (2025)](https://arxiv.org/abs/2506.17001)[arXivLLM-Empowered Knowledge Graph Construction Survey (2025)](https://arxiv.org/abs/2510.20345)[arXivDeep Research: A Survey of Autonomous Research Agents (2025)](https://arxiv.org/abs/2508.12752)[arXivIntegrating LLMs with Knowledge-Based Methods Survey (2025)](https://arxiv.org/abs/2501.13947)

### Primary Sources

[Karpathy's LLM Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)[llms.txt Specification](https://llmstxt.org/)[QMD — Local Markdown Search](https://github.com/tobi/qmd)[docs-for-llms (Simon Willison)](https://github.com/simonw/docs-for-llms)

### Articles and Coverage

-   [VentureBeat — Karpathy shares LLM Knowledge Base architecture](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an)
-   [Analytics India Magazine — Karpathy Moves Beyond RAG](https://analyticsindiamag.com/ai-news/andrej-karpathy-moves-beyond-rag-builds-llm-powered-personal-knowledge-bases)
-   [DAIR.AI Academy — LLM Knowledge Bases](https://academy.dair.ai/blog/llm-knowledge-bases-karpathy)
-   [MindStudio — How to Build a Personal Knowledge Base](https://www.mindstudio.ai/blog/andrej-karpathy-llm-wiki-knowledge-base-claude-code)
-   [MindStudio — LLM Wiki vs RAG Comparison](https://www.mindstudio.ai/blog/llm-wiki-vs-rag-markdown-knowledge-base-comparison)
-   [Analytics Vidhya — LLM Wiki Revolution](https://www.analyticsvidhya.com/blog/2026/04/llm-wiki-by-andrej-karpathy/)

-   [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki) — Open-source LLM Wiki implementation
-   [Ar9av/obsidian-wiki](https://github.com/Ar9av/obsidian-wiki) — Obsidian + LLM Wiki framework
-   [NicholasSpisak/second-brain](https://github.com/NicholasSpisak/second-brain) — LLM-maintained second brain
-   [kfchou/wiki-skills](https://github.com/kfchou/wiki-skills) — Claude Code wiki skills
-   [Astro-Han/karpathy-llm-wiki](https://github.com/Astro-Han/karpathy-llm-wiki) — One-skill LLM Wiki

### Hacker News Discussions

-   [LLM Wiki — example of an "idea file"](https://news.ycombinator.com/item?id=47640875)
-   [Show HN: LLM Wiki Open-Source Implementation](https://news.ycombinator.com/item?id=47656181)
-   [Show HN: CacheZero — Karpathy's idea as one NPM install](https://news.ycombinator.com/item?id=47667723)