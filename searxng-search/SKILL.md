---
name: searxng-search
description: Web search via a local SearXNG instance. Privacy-respecting, aggregates results from multiple engines (Google, Bing, DuckDuckGo, etc.). Use for searching documentation, facts, news, or any web content without an external API key.
---

# SearXNG Search

Web search using a locally-running [SearXNG](https://github.com/searxng/searxng) instance. No API key required — searches are routed through your own instance at `https://searxng`.

## Setup

SearXNG instance is pre-configured at `https://searxng`. No Docker setup needed.

Install dependencies (run once):

```bash
cd {baseDir}
npm install
```

## Search

```bash
{baseDir}/search.js "query"                              # Basic search (5 results)
{baseDir}/search.js "query" -n 10                        # More results (max 20)
{baseDir}/search.js "query" --content                    # Include page content as markdown
{baseDir}/search.js "query" --time-range week            # Filter by time (day|week|month|year)
{baseDir}/search.js "query" --categories news            # Search specific category
{baseDir}/search.js "query" --language en                # Language filter
{baseDir}/search.js "query" --url http://my-searxng:8080  # Custom SearXNG instance URL
{baseDir}/search.js "query" -n 3 --content --time-range month  # Combined options
```

### Options

- `-n <num>` — Number of results (default: 5, max: 20)
- `--content` — Fetch and include readable page content as markdown
- `--time-range <range>` — Filter by recency: `day`, `week`, `month`, `year`
- `--categories <cats>` — Comma-separated categories: `general`, `news`, `images`, `science`, `social media`, `it`
- `--language <lang>` — Language code, e.g. `en`, `de`, `fr` (default: `en`)
- `--url <url>` — SearXNG instance URL (default: `https://searxng`)

## Output Format

```
--- Result 1 ---
Title: Page Title
Link: https://example.com/page
Engine: google, bing
Published: 2024-01-15
Snippet: Description from search results
Content: (if --content flag used)
  Markdown content extracted from the page...

--- Result 2 ---
...
```

## When to Use

- Searching for documentation or API references without an external API key
- Privacy-conscious web searches aggregated from multiple engines
- Looking up facts, news, or current information
- Fetching content from specific URLs via `--content`
- Any task requiring multi-engine web search through your local instance
