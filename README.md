# Pinch of Salt

Unbiased news with verifiable history. This project uses a Python-powered engine to scrape, cluster, and verify news events from multiple global sources.

## Features
- **Python Core**: Modern, fast news processing with `uv` and `scikit-learn`.
- **Intelligent Clustering**: DBSCAN-based event grouping for high-accuracy analysis.
- **Fact Extraction**: Verified facts synthesized via Qwen3-0.6B (runs locally).
- **Zettelkasten Storage**: Incremental flat-file JSON per cluster — no database, no Git LFS.
- **Dedup & Skip**: Already-processed articles are tracked and skipped across runs.
- **Diverse Feeds**: Curated sources across Technical, AI, Research, Medical, and Indian News sectors.
- **Chronological Knowledge Graph**: An interactive DAG showing the historical flow of events.
- **Interactive Filters**: Geographic and category-based news exploration.
- **Local AI Chat**: In-browser Qwen 0.5B via WebLLM for asking questions about news.

## Getting Started

1. **Setup Nix Environment**: `nix develop`
2. **Configure HuggingFace**: Create a `.env` file with `HF_TOKEN=your_token`.
3. **Run Processing**: `just run` (Scrapes and clusters news).
4. **Serve Dashboard**: `just serve` (View at http://localhost:8000).

## System Workflow
Visit `/workflow.html` on the local server to see a detailed visual breakdown of how we transform raw RSS feeds into verifiable history.

## Goals

- Connect recent news with past history with timeline and sources
- AI-driven Technical, Research, and Regional (India) news aggregation
- Intelligent thematic tagging for better discovery
- Highlight conflicts on news sources based on timeline
- Display current news along with all conflicts with description
- Add features in the UI to get detailed information on news content
- Create a timeline of past events from which the news maybe derived

```graph

  news (multiple sources) -> Knowledge base of events

  Applications:
  Knowledge base -> recent events, information conflicts, ...

```

## Project Structure

```
.
├── .github/
│   └── workflows/
│       └── update-feeds.yml    # CI: run engine, commit data, deploy to gh-pages
├── data/
│   ├── feeds.yaml              # RSS feed sources
│   ├── clusters/               # One JSON file per news event cluster (ZK nodes)
│   ├── articles/               # One JSON file per unclustered article
│   └── index.json              # Frontend index (built by engine)
├── src/
│   ├── python/                 # Core backend: scraper, processor, extractor, ZKStore
│   └── frontend/               # Dashboard UI (vanilla JS, reads JSON)
├── justfile                    # Dev commands: run, serve, clean
├── pyproject.toml              # Python dependencies
└── README.md
```

- To see the previous static site instructions go to [README_ui.md](./README_ui.md)
## Benchmarks

- Perplexity
- InShorts
