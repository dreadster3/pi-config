#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// ── Config loading ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadConfig() {
  // Priority: SEARXNG_URL env > user config.json > project config.json
  const envUrl = process.env.SEARXNG_URL?.trim();
  if (envUrl) return envUrl;

  // User-level config (~/.pi/agent/skills/<skill-name>/config.json)
  const home = process.env.HOME;
  if (home) {
    const userConfigPath = join(home, ".pi", "agent", "skills", "searxng-search", "config.json");
    try {
      const userConfig = JSON.parse(readFileSync(userConfigPath, "utf8"));
      if (userConfig.searxngUrl) return userConfig.searxngUrl;
    } catch {
      // User config doesn't exist — fall through
    }
  }

  // Project-level config (.pi/skills/<skill-name>/config.json)
  const projectConfigPath = resolve(__dirname, "..", "..", ".pi", "skills", "searxng-search", "config.json");
  try {
    const projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf8"));
    if (projectConfig.searxngUrl) return projectConfig.searxngUrl;
  } catch {
    // config.json doesn't exist — fall through
  }

  return "https://searxng";
}

// ── Argument parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function extractFlag(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1) {
    args.splice(idx, 1);
    return true;
  }
  return false;
}

function extractOption(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    const value = args[idx + 1];
    args.splice(idx, 2);
    return value;
  }
  return null;
}

const fetchContent = extractFlag("--content");
const numResults = parseInt(extractOption("-n") ?? "5", 10);
const timeRange = extractOption("--time-range");
const categories = extractOption("--categories") ?? "general";
const language = extractOption("--language") ?? "en";
const searxngUrl = extractOption("--url") ?? loadConfig();

const query = args.join(" ").trim();

if (!query) {
  console.log("Usage: search.js <query> [options]");
  console.log("");
  console.log("Options:");
  console.log(
    "  -n <num>                  Number of results (default: 5, max: 20)",
  );
  console.log(
    "  --content                 Fetch readable page content as markdown",
  );
  console.log("  --time-range <range>      Filter: day | week | month | year");
  console.log(
    "  --categories <cats>       Comma-separated: general, news, images, science, it",
  );
  console.log(
    "  --language <lang>         Language code, e.g. en, de, fr (default: en)",
  );
  console.log(
    "  --url <url>               SearXNG base URL (default: https://searxng)",
  );
  console.log("");
  console.log("Examples:");
  console.log('  search.js "javascript async await"');
  console.log('  search.js "rust programming" -n 10');
  console.log(
    '  search.js "climate change news" --categories news --time-range week',
  );
  console.log('  search.js "TypeScript generics" --content');
  process.exit(1);
}

// ── SearXNG search ──────────────────────────────────────────────────────────

async function fetchSearxngResults(query, numResults) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    categories: categories,
    language: language,
  });

  if (timeRange) {
    params.set("time_range", timeRange);
  }

  const url = `${searxngUrl}/search?${params.toString()}`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    if (e.name === "TimeoutError") {
      throw new Error(
        `SearXNG request timed out after 15s. Is the instance running at ${searxngUrl}?`,
      );
    }
    throw new Error(
      `Could not connect to SearXNG at ${searxngUrl}: ${e.message}`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `SearXNG returned HTTP ${response.status}: ${response.statusText}\n${text}`,
    );
  }

  const data = await response.json();

  if (!data.results || !Array.isArray(data.results)) {
    throw new Error(
      "Unexpected SearXNG response format — missing 'results' array.",
    );
  }

  return data.results.slice(0, Math.min(numResults, 20)).map((r) => ({
    title: r.title ?? "",
    link: r.url ?? "",
    snippet: r.content ?? "",
    engines: Array.isArray(r.engines) ? r.engines.join(", ") : (r.engine ?? ""),
    publishedDate: r.publishedDate ?? "",
  }));
}

// ── Content extraction ──────────────────────────────────────────────────────

function htmlToMarkdown(html) {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  turndown.use(gfm);
  turndown.addRule("removeEmptyLinks", {
    filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
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

function makeSilentVirtualConsole() {
  const vc = new VirtualConsole();
  vc.on("jsdomError", () => {}); // suppress CSS parse errors
  return vc;
}

async function fetchPageContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return `(HTTP ${response.status})`;
    }

    const html = await response.text();
    const dom = new JSDOM(html, {
      url,
      virtualConsole: makeSilentVirtualConsole(),
    });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article && article.content) {
      return htmlToMarkdown(article.content).substring(0, 5000);
    }

    // Fallback: strip nav/header/footer and grab body text
    const fallbackDoc = new JSDOM(html, {
      url,
      virtualConsole: makeSilentVirtualConsole(),
    });
    const body = fallbackDoc.window.document;
    body
      .querySelectorAll("script, style, noscript, nav, header, footer, aside")
      .forEach((el) => el.remove());
    const main =
      body.querySelector("main, article, [role='main'], .content, #content") ||
      body.body;
    const text = main?.textContent ?? "";

    if (text.trim().length > 100) {
      return text.trim().substring(0, 5000);
    }

    return "(Could not extract content)";
  } catch (e) {
    return `(Error: ${e.message})`;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

try {
  const results = await fetchSearxngResults(query, numResults);

  if (results.length === 0) {
    console.log("No results found.");
    process.exit(0);
  }

  if (fetchContent) {
    for (const result of results) {
      result.content = await fetchPageContent(result.link);
    }
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`--- Result ${i + 1} ---`);
    console.log(`Title: ${r.title}`);
    console.log(`Link: ${r.link}`);
    if (r.engines) console.log(`Engine: ${r.engines}`);
    if (r.publishedDate) console.log(`Published: ${r.publishedDate}`);
    console.log(`Snippet: ${r.snippet}`);
    if (r.content) {
      console.log(`Content:\n${r.content}`);
    }
    console.log("");
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
