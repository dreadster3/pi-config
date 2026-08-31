# Generated artifacts

Any extension or skill that produces files or other persistent output must store
those artifacts under the project-level `.pi/` directory. Do not write generated
artifacts elsewhere in the repository.

## Semantic commits

Use Conventional Commits for every commit:

```text
<type>(<scope>): <description>
```

Keep the type lowercase and the description concise and imperative. Use the
scope when it clarifies the affected area, for example `feat(extensions): add
...` or `fix(config): correct ...`. When a JIRA ticket is associated with the
change, put its key at the start of the description, after the colon, in square
brackets:

```text
feat(extensions): [PROJ-123] add a new extension
```

Because changes are usually squash-merged, apply the same format to the final
squash commit (typically the PR title), not only to the individual commits.

Do not put the JIRA key before the commit type or use it as the scope; keeping
it in the description preserves the semantic commit header and leaves the
scope available for the affected area.

<!-- codegraph:start -->

# Codegraph — code intelligence over an indexed knowledge graph

Codegraph is a SQLite knowledge graph of every symbol, edge, and file in
the workspace — pre-computed structure you would otherwise re-derive by
reading files (cached intelligence: thousands of parse/trace decisions you
don't pay to re-reason each run). Reads are sub-millisecond; the index lags
writes by ~1s through the file watcher. Reach for it BEFORE _and_ while
writing or editing code — not just for questions: one call returns the
verbatim source PLUS who calls it and what it affects, so you edit with the
blast radius in view. More accurate context, in far fewer tokens and
round-trips than reading files yourself.

## One tool: codegraph_explore — use it instead of reading files

There is a single tool, `codegraph_explore`, and it is Read-equivalent. It
takes either a natural-language question or a bag of symbol/file names and
returns the **verbatim, line-numbered source** of the relevant symbols
grouped by file — the same `<n>\t<line>` shape `Read` gives you, safe to
`Edit` from — PLUS the call path among them (including dynamic-dispatch hops
like callbacks, React re-render, and JSX children that grep can't follow) and
a blast-radius summary of what depends on them.

Whether you're answering "how does X work" or implementing a change (fixing a
bug, adding a feature), call `codegraph_explore` before you Read. ONE call
usually answers the whole question. Codegraph IS the pre-built search index —
so running your own grep + read loop, or delegating the lookup to a separate
file-reading sub-task/agent, repeats work codegraph already did and costs more
for the same answer. A direct codegraph answer is typically one to a few
calls; a grep/read exploration is dozens.

## How to query

- **Almost any question — "how does X work", architecture, a bug, "what/where is X", or surveying an area** → `codegraph_explore` with a natural-language question or the relevant names. ONE capped call returns the verbatim source grouped by file; most often the ONLY call you need.
- **"How does X reach/become Y? / the flow / the path from X to Y"** → `codegraph_explore`, naming the symbols that span the flow (e.g. `mutateElement renderScene`) — it surfaces the call path among them, riding dynamic-dispatch hops, and returns their source.
- **Reading or editing a file/symbol you can name** → put its name or file path in the `codegraph_explore` query — it returns that current line-numbered source (safe to `Edit` from) with the call path and blast radius attached, so you don't Read it separately. For an overloaded name it returns every matching definition's body in one call.
- **Need more?** Call `codegraph_explore` again with more specific names — treat the source it returns as already Read.

## Anti-patterns

- **Trust codegraph's results — don't re-verify them with grep.** They come from a full AST parse; re-checking with grep is slower, less accurate, and wastes context.
- **Don't grep or Read first** to find or understand indexed code — ONE `codegraph_explore` returns the relevant symbols' source together in a single round-trip. Reach for raw `Read`/`Grep` only to confirm a specific detail codegraph didn't cover, or for what codegraph doesn't index (configs, docs).
- **Don't reconstruct a flow by hand** — name the endpoints in one `codegraph_explore` and it surfaces the path between them, dynamic-dispatch hops included.
- **After editing, check the staleness banner.** When a tool response starts with "⚠️ Some files referenced below were edited since the last index sync…", the listed files are pending re-index — Read those specific files for accurate content. Every file NOT in that banner is fresh, so still trust codegraph. A different, rarer banner — "⚠️ CodeGraph auto-sync is DISABLED…" — means live watching stopped entirely (the whole index is frozen, not just a few files); until it's resolved, Read files directly to confirm anything that may have changed.

## Limitations

- If a tool reports a project isn't indexed (no `.codegraph/`), stop calling codegraph tools for that project for the rest of the session and use your built-in tools there instead. Indexing is the user's decision — mention they can run `codegraph init` if it comes up, but don't run it yourself.
- Index lags file writes by ~1 second.
- Cross-file resolution is best-effort name matching; ambiguous calls may return multiple candidates.
- No live correctness validation — that's still the TypeScript compiler / test suite / linter's job. Codegraph supplements those with structural context they don't have.

<!-- codegraph:end -->

<!-- searxng:start -->

# SearXNG — web search through LiteLLM

SearXNG is the configured web-search MCP server, routed through the personal
LiteLLM instance in `config/mcp.json` and backed by
[`ihor-sokoliuk/mcp-searxng`](https://github.com/ihor-sokoliuk/mcp-searxng).
Reach for it whenever current,
external, or unknown-on-the-web information is needed: documentation,
announcements, public APIs, troubleshooting, facts, or finding a page whose
URL is not already known. It returns ranked search results without requiring a
browser.

## Two tools: search first, then read the useful result

Use `searxng_web_search` to discover relevant URLs, then use `web_url_read`
to retrieve a selected result as readable Markdown. Do not guess URLs or rely
on stale model knowledge when a web lookup is appropriate. Search results are
for discovery; `web_url_read` is the source to use when answering from page
content.

## How to query

- **Find current external information or a page you do not know** → call `searxng_web_search` with a focused `query`. Use `num_results` only as high as needed and refine with normal search operators such as `site:`, quoted phrases, and `-term` exclusions.
- **Read a search result** → call `web_url_read` with its URL. Use the full page by default; use `section`, `paragraphRange`, or `readHeadings` only when they directly reduce an otherwise large result.
- **Need current library, API, or product documentation** → search for the official documentation domain, then read the primary source rather than relying on result snippets, secondary posts, or training data.
- **Need multiple sources** → search once, read only the few results that materially support the answer, and distinguish primary sources from commentary.
- **Need more or better results** → refine the query and search again; use `pageno`, `time_range`, `language`, or `engines` only when they solve a real retrieval problem.

## Anti-patterns

- **Do not use SearXNG to search the local filesystem or repository.** Use Codegraph or built-in file tools for local code and configuration.
- **Do not treat search snippets as authoritative page content.** Open the relevant source with `web_url_read` before making a factual claim from it.
- **Do not read every result.** Start with a narrow query and fetch only the strongest sources.
- **Do not use a browser for ordinary research.** SearXNG search plus `web_url_read` is cheaper and more direct; use browser automation only when a page requires interaction or JavaScript rendering.

## Limitations

- SearXNG indexes public web results; coverage, ranking, and freshness depend on its upstream engines.
- A result can be stale, incomplete, inaccessible, or differ from the live page—verify important details in the source page and, when warranted, corroborate them with another primary source.
- `web_url_read` handles readable web content, not binary downloads such as PDFs or archives. Use a purpose-built document tool when needed.
- The server is configured as `searxng` in `config/mcp.json`; do not replace its LiteLLM URL or authentication settings in these instructions.

<!-- searxng:end -->
