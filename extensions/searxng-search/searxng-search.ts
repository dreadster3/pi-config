import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SearchOptions {
  max_results?: number;
  time_range?: string;
  categories?: string;
  language?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface FetchResult {
  title: string;
  content: string;
  links: string[];
}

// ── Config loading ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSearxngUrl(): string {
  const envUrl = process.env.SEARXNG_URL?.trim();
  if (envUrl) return envUrl;

  const home = process.env.HOME;
  if (home) {
    const userConfigPath = join(
      home,
      ".pi",
      "agent",
      "extensions",
      "searxng-search",
      "config.json",
    );
    try {
      const userConfig = JSON.parse(readFileSync(userConfigPath, "utf8"));
      if (userConfig.searxngUrl) return userConfig.searxngUrl;
    } catch {
      // User config doesn't exist — fall through
    }
  }

  const projectConfigPath = resolve(
    __dirname,
    "..",
    ".pi",
    "extensions",
    "searxng-search",
    "config.json",
  );
  try {
    const projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf8"));
    if (projectConfig.searxngUrl) return projectConfig.searxngUrl;
  } catch {
    // config.json doesn't exist — fall through
  }

  return "https://searxng";
}

function getBaseUrl(): string {
  return loadSearxngUrl().replace(/\/+$/, "");
}

function withSignal(
  obj: Record<string, unknown>,
  signal?: AbortSignal,
): Record<string, unknown> {
  if (signal) return { ...obj, signal };
  return obj;
}

// ── Content extraction helpers ───────────────────────────────────────────────

function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  turndown.use(gfm);
  turndown.addRule("removeEmptyLinks", {
    filter: (node: Node) => node.nodeName === "A" && !node.textContent?.trim(),
    replacement: () => "",
  });
  return turndown
    .turndown(html)
    .replace(/\[\\?\[\s*\\?\]\]\([^)]*\)/g, "")
    .replace(/ +/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeSilentVirtualConsole(): VirtualConsole {
  const vc = new VirtualConsole();
  vc.on("jsdomError", () => {});
  return vc;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Search a SearXNG instance and return formatted results.
 *
 * Can be called directly for testing or from the tool's execute handler.
 */
export async function searchSearxng(
  query: string,
  options: SearchOptions = {},
  signal?: AbortSignal,
): Promise<string> {
  const baseUrl = getBaseUrl();
  const maxResults = Math.min(options.max_results ?? 5, 20);

  const paramsObj = new URLSearchParams({
    q: query,
    format: "json",
    categories: options.categories ?? "general",
    language: options.language ?? "en",
  });

  if (options.time_range) {
    paramsObj.set("time_range", options.time_range);
  }

  const url = `${baseUrl}/search?${paramsObj.toString()}`;

  try {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        ...withSignal({}, signal),
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new Error(
          `SearXNG request timed out after 15s. Is the instance running at ${baseUrl}?`,
        );
      }
      throw new Error(
        `Could not connect to SearXNG at ${baseUrl}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Search API error (status ${response.status}): ${errorText || response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      results: Array<{
        title: string;
        url: string;
        content: string;
      }>;
    };

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error(
        "Unexpected SearXNG response format — missing 'results' array.",
      );
    }

    const results = data.results.slice(0, maxResults).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
    }));

    return (
      results
        .map(
          (r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content}`,
        )
        .join("\n\n") || "No results found."
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      throw new Error(
        `Could not connect to SearXNG at ${baseUrl}. Make sure SearXNG is running.`,
      );
    }
    throw error;
  }
}

/**
 * Fetch a URL and extract readable content.
 *
 * Can be called directly for testing or from the tool's execute handler.
 */
export async function fetchPage(
  url: string,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    ...withSignal({}, signal),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  // Extract title
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    title = titleMatch[1].trim();
  }

  // Extract links
  const linkRegex = /href=["']([^"']+)["']/g;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      if (match[1]) {
        const fullUrl = new URL(match[1], url).href;
        if (!links.includes(fullUrl)) {
          links.push(fullUrl);
        }
      }
    } catch {
      // Skip invalid URLs
    }
  }

  // Extract content using Readability
  const dom = new JSDOM(html, {
    url,
    virtualConsole: makeSilentVirtualConsole(),
  });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  let content = "";
  if (article && article.content) {
    content = htmlToMarkdown(article.content).substring(0, 5000);
  } else {
    const fallbackDoc = new JSDOM(html, {
      url,
      virtualConsole: makeSilentVirtualConsole(),
    });
    const body = fallbackDoc.window.document;
    body
      .querySelectorAll("script, style, noscript, nav, header, footer, aside")
      .forEach((el: Element) => el.remove());
    const main =
      body.querySelector("main, article, [role='main'], .content, #content") ||
      body.body;
    content = (main?.textContent ?? "").trim().substring(0, 5000);
    if (!content) {
      content = "(Could not extract content)";
    }
  }

  return { title, content, links };
}

// ── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for real-time information using a local SearXNG instance. Privacy-respecting, aggregates results from multiple engines (Google, Bing, DuckDuckGo, etc.). No API key required.",
    parameters: Type.Object({
      query: Type.String({ description: "The search query to execute" }),
      max_results: Type.Optional(
        Type.Number({
          description:
            "Maximum number of search results to return (default: 5, max: 20)",
          default: 5,
        }),
      ),
      time_range: Type.Optional(
        Type.String({
          description: "Filter by recency: day, week, month, or year",
          examples: ["day", "week", "month", "year"],
        }),
      ),
      categories: Type.Optional(
        Type.String({
          description:
            "Comma-separated categories: general, news, images, science, it, social media",
          examples: ["general", "news", "science"],
        }),
      ),
      language: Type.Optional(
        Type.String({
          description: "Language code, e.g. en, de, fr (default: en)",
          examples: ["en", "de", "fr"],
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const formatted = await searchSearxng(params.query, params, signal);
      const baseUrl = getBaseUrl();

      // Re-fetch details for the `details` field (searchSearxng returns formatted text only)
      const maxResults = Math.min(params.max_results ?? 5, 20);
      const paramsObj = new URLSearchParams({
        q: params.query,
        format: "json",
        categories: params.categories ?? "general",
        language: params.language ?? "en",
      });
      if (params.time_range) {
        paramsObj.set("time_range", params.time_range);
      }

      let results: SearchResult[] = [];
      try {
        const response = await fetch(
          `${baseUrl}/search?${paramsObj.toString()}`,
          {
            headers: { Accept: "application/json" },
            ...withSignal({}, signal),
          },
        );
        if (response.ok) {
          const data = (await response.json()) as {
            results: Array<{ title: string; url: string; content: string }>;
          };
          if (data.results) {
            results = data.results.slice(0, maxResults).map((r) => ({
              title: r.title ?? "",
              url: r.url ?? "",
              content: r.content ?? "",
            }));
          }
        }
      } catch {
        // Details are optional; tool still works with formatted text
      }

      return {
        content: [{ type: "text", text: formatted }],
        details: { results },
      };
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch and extract readable text content from a web page URL. Uses Readability + JSDOM for clean content extraction.",
    parameters: Type.Object({
      url: Type.String({
        description: "URL to fetch and extract content from",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const result = await fetchPage(params.url, signal);

      const formatted = [
        `Title: ${result.title}`,
        "",
        "Content:",
        result.content,
        "",
        `Links found: ${result.links.length}`,
        ...result.links.slice(0, 10).map((l) => `  - ${l}`),
      ].join("\n");

      return {
        content: [{ type: "text", text: formatted }],
        details: result,
      };
    },
  });
}
