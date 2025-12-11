# Pinch Of Salt

History with a pinch of salt (only english for now)

## Goals

- Connect recent news with past history with timeline and sources
- Highlight conflicts on news sources based on timeline
- Display current news along with all conflicts with description
- Add features in the UI to get detailed information on news content
- Create a timeline of past events from which the news maybe derived

```graph

  news (multiple sources) -> Knowledge base of events

  Applications:
  Knowledge base -> recent events, information conflicts, ...

```

## Tasks

- Pick datasets, sources (rss feeds, websites)
- Create a simple UI for accessing the news
- Make a server side api for all the existing features
- Parse news from multiple sources to identify events
- Create a knowledge graph of all past history (requires discussion)

## Project Structure

```
.
├── .github/
│   └── workflows/
│       └── update-feeds.yml    # GitHub Action for auto-update of static site
├── data/
│   └── feeds.yaml              # RSS feed sources
├── src/
│   ├── rss.py                  # RSS fetching library
│   ├── api.py                  # API for accessing the library
    ├── generate_site.py        # Static site generator script
│   └── static.html             # HTML template for static site
├── docs/                       # Generated static site (GitHub Pages)
│   └── index.html
├── pyproject.toml              # Project details
└── README.md
```

- To generate static site go to [README_ui.md](./README_ui.md)

## Benchmarks

- Perplexity
- InShorts
