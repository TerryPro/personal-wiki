## Why Raw Files Are the Wrong Starting Point for AI Agents

Most organizations have more internal knowledge than they realize. Shared drives full of PDFs, Notion pages with outdated procedures, email threads where critical decisions got buried — it’s all there. But when you hand that pile of raw files to an AI agent and ask it to do something useful, you quickly find out the problem: agents don’t read documents the way humans do.

This is the core problem that the LLM wiki concept addresses. Andrej Karpathy — former OpenAI researcher and Tesla AI director, now one of the most influential voices on practical AI systems — has been vocal about how knowledge needs to be _structured_ before AI agents can reliably work with it. The LLM wiki is his framing for that structure: a purpose-built knowledge base designed not for human browsing, but for agent search and retrieval.

This article breaks down what the LLM wiki architecture is, why it matters for building reliable AI agents, and how to build one yourself.

___

## What an LLM Wiki Actually Is

The term “wiki” here is intentional. A traditional wiki — think Wikipedia or a company’s Confluence space — is structured for human navigation. You have pages, links between them, categories, and a search bar. Humans can skim, jump around, and use context to fill in gaps.

## Other agents start typing. Remy starts asking.

YOU SAID "Build me a sales CRM."

REMY ASKS

01 DESIGN Should it feel like Linear, or Salesforce?

02 UX How do reps move deals — drag, or dropdown?

03 ARCH Single team, or multi-org with permissions?

Scoping, trade-offs, edge cases — the real work. Before a line of code.

An LLM wiki is designed around a different set of constraints. AI agents, particularly those using retrieval-augmented generation (RAG), don’t browse — they query. They take a chunk of text, embed it into a vector space, and search for semantically similar content. The quality of what they get back depends entirely on how the source knowledge was organized before it entered the system.

In plain terms, RAG is a two-step loop: **retrieve** the most relevant chunks of content for a question, then **generate** an answer from only that retrieved material. The LLM doesn’t memorize your knowledge — it reads the right pieces at query time. An LLM wiki is what makes the “retrieve” half reliable; poor knowledge organization is the most common reason RAG underperforms.

Karpathy’s framing emphasizes a critical insight: **the bottleneck in most AI agent systems isn’t the model — it’s the knowledge layer underneath it.** You can use the best LLM available, but if the context you’re feeding it is inconsistent, redundant, or poorly chunked, the outputs will reflect that.

An LLM wiki solves this by treating each unit of knowledge as an atomic, self-contained artifact — clean, consistent, and designed to be retrieved in isolation without losing meaning.

### Key Differences Between a Raw Document Store and an LLM Wiki

|Raw File Store|LLM Wiki|
|---|---|
|Documents in original format|Processed, chunked content|
|No semantic indexing|Vector embeddings for similarity search|
|Human-navigable structure|Agent-queryable structure|
|Redundant, overlapping content|Deduplicated, atomic entries|
|Mixed formatting and quality|Consistent structure and metadata|

The distinction matters because agents making decisions on poor retrieval will fail in ways that are hard to debug — not because the model is wrong, but because the context it received was wrong.

___

## Karpathy’s Core Principles for Agent-Readable Knowledge

Karpathy’s public talks and writing on LLM systems point to several principles that shape how a proper LLM wiki should be built. These aren’t abstract ideas — they’re architectural decisions with real consequences.

### Atomic Knowledge Units

Each piece of knowledge should stand alone. If an agent retrieves a chunk about your refund policy, it shouldn’t need to also retrieve three other chunks to understand it. Self-contained units reduce the chance of the agent reasoning from incomplete context.

This means splitting documents deliberately — not just at arbitrary token counts, but at semantic boundaries. A 10-page policy document isn’t one knowledge unit; it’s potentially 20 or 30, each covering a distinct concept.

### Context That Travels With the Chunk

One of the most common failures in RAG-based systems is what researchers call “context loss at retrieval time.” A chunk gets pulled out of a document, but the metadata that made it useful — what document it came from, when it was last updated, what section it belongs to — gets dropped.

Karpathy’s architecture thinking emphasizes that every chunk should carry enough context to be interpretable on its own. This typically means embedding source metadata, timestamps, and parent document references directly into the chunk’s structure.

### Consistent Formatting Across Entries

LLMs are pattern-matching systems at their core. When knowledge entries follow a consistent structure — same field names, same formatting conventions, same writing style — agents retrieve and reason over them more reliably. Inconsistency in the knowledge base introduces noise that the model has to work around.

## One coffee. One working app.

You bring the idea. Remy manages the project.

WHILE YOU WERE AWAY

✓Designed the data model

✓Picked an auth scheme — sessions + RBAC

✓Wired up Stripe checkout

✓Deployed to production

Live at yourapp.msagent.ai

A company wiki where some entries are written in bullet points, some in dense prose, and some are just pasted PDFs is not an LLM-friendly knowledge base. The LLM wiki requires editorial discipline.

### Freshness and Versioning

An LLM wiki that goes stale becomes actively harmful — it provides confident-sounding answers based on outdated information. Karpathy’s approach treats knowledge maintenance as a first-class concern, not an afterthought. This means building pipelines that can update entries when source documents change, flag stale content, and track when entries were last verified.

___

## The Architecture: How an LLM Wiki Is Built

Understanding the concept is one thing. Here’s how it actually works as a system.

### The Ingestion Pipeline

Everything starts with ingestion. Raw source materials — documents, web pages, database exports, transcripts, emails — flow into a processing pipeline. This pipeline does several things:

-   **Parsing**: Converts raw formats (PDF, DOCX, HTML) into clean text
-   **Cleaning**: Strips headers, footers, navigation elements, boilerplate
-   **Deduplication**: Identifies and removes redundant content across sources
-   **Splitting**: Divides documents into semantically coherent chunks

The splitting step is where most implementations go wrong. Naive chunking at fixed token counts (e.g., every 512 tokens) cuts across logical boundaries and creates fragments that lose meaning in isolation. Better approaches use sentence boundaries, paragraph breaks, or semantic similarity scores to find natural split points.

Three chunking strategies cover most cases:

-   **Fixed-size** — split every 256–512 tokens with a small overlap (50–100 tokens) so thoughts aren’t cut mid-sentence. Simple, but blind to structure.
-   **Semantic** — split at natural boundaries like paragraph breaks or section headers, so each chunk holds one coherent idea.
-   **Hierarchical** — store embeddings at multiple granularities (sentence and paragraph, say) and retrieve at whichever level fits the query.

For most knowledge bases, splitting on section or paragraph boundaries with a small overlap is a solid default.

### Embedding Generation

Once content is chunked, each chunk gets converted into a vector embedding — a numerical representation that captures the semantic meaning of the text. Two chunks that cover similar concepts will have embeddings that are close together in vector space, regardless of whether they use the same exact words.

This is what enables semantic search. When an agent asks a question, the question also gets embedded, and the system retrieves whichever chunks are most semantically similar. The quality of your embeddings (which model you use, how you generate them) directly affects retrieval quality.

### The Vector Database

Embeddings live in a vector database — systems like Pinecone, Weaviate, Chroma, or pgvector. These databases are optimized for approximate nearest-neighbor search: given a query vector, find the N closest stored vectors quickly.

The vector database is paired with a metadata store that keeps the original text, source references, timestamps, and any other structured fields alongside the embeddings.

### Retrieval and Re-ranking

When an agent queries the wiki, it doesn’t just grab the top result. Well-designed systems apply re-ranking — a secondary scoring pass that reorders retrieved chunks based on relevance, recency, or other criteria. This two-stage approach (retrieve broadly, then rank tightly) gives much better results than single-pass retrieval.

## Remy doesn't build the plumbing. It inherits it.

Other agents wire up auth, databases, models, and integrations from scratch every time you ask them to build something.

WHAT REMY DOESN'T HAVE TO BUILD

200+

AI MODELS

GPT · Claude · Gemini · Llama

✓

1,000+

INTEGRATIONS

Slack · Stripe · Notion · HubSpot

✓

MANAGED DB

AUTH

PAYMENTS

CRONS

Remy ships with all of it from MindStudio — so every cycle goes into the app you actually want.

Some architectures also use hybrid search: combining vector similarity search with traditional keyword search (BM25) and merging the results. This handles cases where exact terminology matters — acronyms, product names, specific codes — that semantic search sometimes misses.

### The Agent Interface

The agent itself doesn’t need to know about embeddings or databases. From its perspective, it has a tool it can call: something like `search_knowledge_base(query)`. It sends a natural language query, gets back the most relevant chunks with their metadata, and incorporates that context into its reasoning.

The cleaner this interface is, the more reliably the agent will use it. Agents work best when their tools have clear, predictable behavior.

### Metadata Filtering and Source Citations

Two refinements make retrieval noticeably more precise once the wiki grows:

-   **Metadata filtering** — every chunk carries fields like source, date, content type, and tags. Filtering on those _before_ semantic search (“only notes from the last month,” “only content tagged machine-learning”) narrows the candidate pool and cuts false matches.
-   **Source citations** — return the source chunks alongside the answer. It lets users verify claims and read deeper, and it’s the single most effective guard against an agent quietly answering from its training data instead of your knowledge base.

___

## How to Build Your Own LLM Wiki

Here’s a practical path for building an LLM wiki from scratch — whether for a business, a product, or a personal knowledge system.

### Step 1: Audit Your Source Material

Before building anything, figure out what knowledge you’re actually working with. Catalog your sources by type, format, and quality. Ask:

-   What are the authoritative sources? (Not every document should go in — only canonical ones)
-   How fresh does this content need to be? What’s the acceptable staleness threshold?
-   What questions will agents actually be asked? Work backward from use cases.

This step saves enormous effort later. An LLM wiki built from all your documentation indiscriminately will perform worse than one built from a carefully selected, high-quality subset.

### Step 2: Design Your Schema

Every entry in your wiki should follow a consistent schema. At minimum, this includes:

-   **Content**: The actual text of the chunk
-   **Source**: Where it came from
-   **Created/updated timestamps**: When it was added and last verified
-   **Topic tags or category**: For metadata filtering
-   **Chunk ID**: For traceability

More sophisticated schemas add confidence scores, related-entry links, or subject matter owner fields. Design the schema around your retrieval needs — what filters will agents use? What context will they need to trust a retrieved chunk?

### Step 3: Build the Ingestion Pipeline

Start simple. A basic pipeline can be built with:

-   A document parser (PyPDF2, Unstructured, or similar for various file types)
-   A chunking library (LangChain’s text splitters, or LlamaIndex’s node parsers)
-   An embedding model (OpenAI’s text-embedding-3-small, or a local model via Ollama)
-   A vector store (Chroma is easy to start with locally; Pinecone or Weaviate for production)

Run your source material through the pipeline and spot-check the results. Look at individual chunks: do they make sense in isolation? Does the metadata travel with them?

### Step 4: Build the Retrieval Layer

Set up your search endpoint and test it with the questions your agents will actually ask. Evaluate retrieval quality directly — not by running end-to-end tests, but by looking at what’s coming back from specific queries.

Common issues to look for:

-   Important chunks that don’t surface for obvious queries (likely a chunking or embedding problem)
-   Irrelevant chunks ranking highly (may need re-ranking or better query formulation)
-   Duplicate content appearing in results (deduplication issue in ingestion)

### Step 5: Connect to Your Agents and Iterate

Give your agents access to the search tool and watch how they use it. The failure modes will tell you what to fix:

-   **Agent ignores the knowledge base**: Tool interface is unclear or results are too noisy
-   **Agent retrieves wrong content**: Chunking, embedding, or re-ranking needs tuning
-   **Agent gets good results but reasons incorrectly**: Context quality is fine; this is a prompting issue
-   **Agent results go stale**: Need to build update triggers into the ingestion pipeline

Most good LLM wikis aren’t designed once — they’re tuned continuously based on observed agent behavior.

___

## Frequently Asked Questions

### What is an LLM wiki in simple terms?

An LLM wiki is a knowledge base structured specifically for AI agents to search and use. Unlike a regular document library, it organizes information into small, self-contained chunks with consistent formatting and semantic search indexing. This lets AI agents retrieve exactly the context they need rather than getting lost in full documents.

### How is an LLM wiki different from RAG?

RAG (retrieval-augmented generation) is the technique — the method of retrieving relevant context and providing it to an LLM at inference time. An LLM wiki is the knowledge base that RAG pulls from. You need a well-structured LLM wiki for RAG to work well; poor knowledge organization is the most common reason RAG implementations underperform.

### What is the best chunk size for an LLM wiki?

There’s no universal answer. Karpathy and other practitioners generally recommend chunks of 256–512 tokens for semantic search, with some overlap (50–100 tokens) between adjacent chunks to preserve context at boundaries. But the right size depends on your content type — technical documentation might need smaller chunks; narrative content might need larger ones. The best approach is to test against your actual retrieval use cases.

### Do you need a vector database to build an LLM wiki?

For small-scale use (a few hundred documents), you can use in-memory search or even keyword-based approaches. But for any production system, a vector database gives you significantly better semantic retrieval and the ability to scale. Open-source options like Chroma and pgvector have very low setup friction. Managed services like Pinecone or Weaviate handle scale and availability if you need them.

### How do you keep an LLM wiki up to date?

This is one of the harder operational problems. The standard approach is to build update triggers into your ingestion pipeline — so when a source document changes, the corresponding chunks get re-processed and re-embedded automatically. Many teams also add a “last verified” date to each entry and build agents that flag content older than a defined threshold for human review.

### Can non-technical teams build an LLM wiki?

### Everyone else built a construction worker.

We built the contractor.

🦺

CODING AGENT

Types the code you tell it to.

One file at a time.

🧠

CONTRACTOR · REMY

Runs the entire build.

UI, API, database, deploy.

Yes, though they’ll need tooling that abstracts the infrastructure. Platforms like MindStudio, or knowledge management tools with built-in RAG pipelines, let teams configure knowledge bases without writing embedding or vector search code. The editorial work — deciding what content to include, how to structure entries, how to maintain freshness — is independent of technical skill and often the more important half of the problem anyway.

___

## Key Takeaways

-   The LLM wiki is a knowledge base architecture designed for agent search rather than human browsing — atomic chunks, consistent structure, semantic indexing, and metadata that travels with each entry.
-   Karpathy’s core insight is that the bottleneck in most AI agent systems is knowledge quality, not model capability. Better-organized context produces better agent behavior.
-   A well-built LLM wiki requires four layers: an ingestion pipeline, embedding generation, a vector database, and a clean agent-facing retrieval interface.
-   Building one well is iterative — start with high-quality source content, design a clear schema, and tune based on real retrieval failures rather than guessing upfront.
-   For teams who don’t want to build the full stack from scratch, platforms like [MindStudio](https://mindstudio.ai/) let you connect knowledge sources to AI agents without handling the infrastructure layer yourself.

The architecture isn’t complicated in principle. The work is in the details: choosing what knowledge belongs, keeping it fresh, and structuring it so agents can actually use it. Get that right, and your agents stop hallucinating and start being genuinely useful.