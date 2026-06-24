/**
 * Gitignore Protection Extension
 *
 * Prevents pi from reading files or folders that are listed in `.gitignore`,
 * with an exception for paths inside a `.pi` folder.
 *
 * Intercepts the following tool calls and blocks access to gitignored paths:
 *  - read   (file contents)
 *  - ls     (directory listings)
 *  - grep   (content search — respects .gitignore by default, but an explicit
 *            gitignored `path` argument is blocked)
 *  - find   (file search — respects .gitignore by default, but an explicit
 *            gitignored `path` argument is blocked)
 *  - edit   (reads file to diff — blocked since it exposes file contents)
 *  - write  (prevents creating/modifying files in gitignored locations)
 *  - bash   (scans command for file path references and blocks gitignored ones)
 *
 * Uses `git check-ignore` for accurate matching against all gitignore rules
 * (nested `.gitignore` files, negation patterns, etc.).
 *
 * Bash interception: the command string is tokenized by splitting on shell
 * operators and whitespace. Each token that resolves to an existing file or
 * directory on disk is checked against `git check-ignore`. This catches common
 * file-reading patterns like `cat .env`, `head file | grep x`, or
 * `python3 -c "...open('file')..."`. Quoted strings are preserved so paths
 * with spaces are handled correctly.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

export default function (pi: ExtensionAPI) {
  // Cache git check-ignore results for the lifetime of the session.
  // Keyed by absolute path to avoid redundant git subprocess calls.
  const ignoreCache = new Map<string, boolean>();

  // Track whether we are inside a git work tree.
  let isGitRepo = false;

  /**
   * Check if a path is gitignored using `git check-ignore`.
   *
   * `git check-ignore -q <path>` exits with:
   *   0  → path is ignored
   *   1  → path is not ignored
   *   128 → error (not a git repo, path outside work tree, etc.)
   */
  async function isGitIgnored(rawPath: string, cwd: string): Promise<boolean> {
    if (!rawPath) return false;

    const absolutePath = path.resolve(cwd, rawPath);
    const cacheKey = `${cwd}::${absolutePath}`;

    const cached = ignoreCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let result = false;
    try {
      const execResult = await pi.exec(
        "git",
        ["check-ignore", "-q", "--", absolutePath],
        { cwd, timeout: 5000 },
      );
      result = execResult.code === 0;
    } catch {
      // git not available or other error — don't block
      result = false;
    }

    ignoreCache.set(cacheKey, result);
    return result;
  }

  /**
   * Check if a path is inside a `.pi` folder.
   *
   * Returns true if any component of the absolute path is `.pi`.
   * This covers all cases:
   *   .pi/config.json          → true
   *   src/.pi/local.json       → true
   *   /project/.pi/sub/file    → true
   *   node_modules/foo/bar.js  → false
   */
  function isInsidePiFolder(rawPath: string, cwd: string): boolean {
    if (!rawPath) return false;
    const absolutePath = path.resolve(cwd, rawPath);
    const segments = absolutePath.split(path.sep);
    return segments.includes(".pi");
  }

  /**
   * Determine whether a tool call targeting `rawPath` should be blocked.
   *
   * A path is blocked when:
   *   1. It is gitignored, AND
   *   2. It is NOT inside a `.pi` folder
   */
  async function checkPath(
    rawPath: string,
    cwd: string,
    toolName: string,
  ): Promise<{ block: boolean; reason?: string }> {
    if (!rawPath) return { block: false };

    // Always allow paths inside .pi folders
    if (isInsidePiFolder(rawPath, cwd)) {
      return { block: false };
    }

    const ignored = await isGitIgnored(rawPath, cwd);
    if (ignored) {
      const displayPath =
        path.relative(cwd, path.resolve(cwd, rawPath)) || rawPath;
      return {
        block: true,
        reason: `Blocked by gitignore protection: '${displayPath}' is gitignored and not inside a .pi/ folder. The ${toolName} tool cannot access gitignored files.`,
      };
    }

    return { block: false };
  }

  /**
   * Extract potential file paths from a bash command string.
   *
   * The command is tokenized by:
   *  1. Extracting quoted strings (preserving paths with spaces)
   *  2. Extracting bare words (non-whitespace tokens)
   *  3. Stripping leading/trailing shell operators from bare words
   *  4. Filtering out flags, shell variables, and pure numbers
   *
   * Only tokens that resolve to an existing file or directory on disk
   * are returned — this eliminates most false positives (command names,
   * script content, patterns, etc.) while catching real file references.
   */
  function extractExistingPaths(command: string, cwd: string): string[] {
    // Match single-quoted strings, double-quoted strings, or bare words.
    // Quoted strings capture their content (without quotes).
    // Bare words capture non-whitespace runs (may include trailing operators).
    const tokenRegex = /'([^']*)'|"([^"]*)"|(\S+)/g;

    const candidates: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(command)) !== null) {
      const quoted = match[1] ?? match[2];
      if (quoted !== undefined) {
        // Quoted string — treat the entire content as a potential path
        candidates.push(quoted);
        continue;
      }

      // Bare word — strip leading/trailing shell operators and separators
      const bare = (match[3] ?? "")
        .replace(/^[|&;()<>"'`=]+/, "")
        .replace(/[|&;()<>"'`=]+$/, "");

      if (!bare) continue;

      // Also handle `=` separators (e.g. VAR=file.json or --opt=file.json)
      const eqParts = bare.split("=");
      for (const part of eqParts) {
        if (!part) continue;
        candidates.push(part);
      }
    }

    // Filter to tokens that resolve to existing files/directories on disk
    const existingPaths: string[] = [];
    for (const candidate of candidates) {
      // Skip flags
      if (candidate.startsWith("-")) continue;
      // Skip shell variable references
      if (candidate.startsWith("$")) continue;
      // Skip pure numbers
      if (/^\d+$/.test(candidate)) continue;
      // Skip very short tokens (likely not paths)
      if (candidate.length < 2) continue;

      const absolutePath = path.resolve(cwd, candidate);
      try {
        if (fs.existsSync(absolutePath)) {
          existingPaths.push(candidate);
        }
      } catch {
        // Ignore stat errors
      }
    }

    return existingPaths;
  }

  /**
   * Check a bash command for references to gitignored files.
   *
   * Extracts all path-like tokens from the command that resolve to existing
   * files/directories on disk, then checks each against `git check-ignore`.
   * If any gitignored path is found (outside `.pi/`), the command is blocked.
   */
  async function checkBashCommand(
    command: string,
    cwd: string,
  ): Promise<{ block: boolean; reason?: string }> {
    const candidates = extractExistingPaths(command, cwd);

    // Check each candidate path — block on the first gitignored match
    for (const candidate of candidates) {
      if (isInsidePiFolder(candidate, cwd)) continue;

      const ignored = await isGitIgnored(candidate, cwd);
      if (ignored) {
        const displayPath =
          path.relative(cwd, path.resolve(cwd, candidate)) || candidate;
        return {
          block: true,
          reason: `Blocked by gitignore protection: bash command references '${displayPath}', which is gitignored and not inside a .pi/ folder.`,
        };
      }
    }

    return { block: false };
  }

  pi.on("tool_call", async (event, ctx) => {
    // Skip protection if we're not in a git repo
    if (!isGitRepo) return;

    const cwd = ctx.cwd;

    // --- read: block gitignored file reads ---
    if (isToolCallEventType("read", event)) {
      return checkPath(event.input.path ?? "", cwd, "read");
    }

    // --- ls: block listing gitignored directories ---
    if (isToolCallEventType("ls", event)) {
      // No path → lists cwd (project root), which is never gitignored
      return checkPath(event.input.path ?? "", cwd, "ls");
    }

    // --- grep: block explicit gitignored search paths ---
    if (isToolCallEventType("grep", event)) {
      // grep respects .gitignore by default; only block explicit gitignored paths
      return checkPath(event.input.path ?? "", cwd, "grep");
    }

    // --- find: block explicit gitignored search paths ---
    if (isToolCallEventType("find", event)) {
      // find respects .gitignore by default; only block explicit gitignored paths
      return checkPath(event.input.path ?? "", cwd, "find");
    }

    // --- edit: block editing gitignored files (edit reads file contents) ---
    if (isToolCallEventType("edit", event)) {
      return checkPath(event.input.path ?? "", cwd, "edit");
    }

    // --- write: block writing to gitignored locations ---
    if (isToolCallEventType("write", event)) {
      return checkPath(event.input.path ?? "", cwd, "write");
    }

    // --- bash: scan command for gitignored file references ---
    if (isToolCallEventType("bash", event)) {
      const command = event.input.command ?? "";
      if (!command) return { block: false };
      return checkBashCommand(command, cwd);
    }
  });

  // Detect git repo on session start and notify the user.
  pi.on("session_start", async (_event, ctx) => {
    try {
      const result = await pi.exec(
        "git",
        ["rev-parse", "--is-inside-work-tree"],
        { cwd: ctx.cwd, timeout: 5000 },
      );
      isGitRepo = result.code === 0;
    } catch {
      isGitRepo = false;
    }

    if (isGitRepo) {
      ctx.ui.notify(
        "🛡️ Gitignore protection active — gitignored files are blocked (except inside .pi/)",
        "info",
      );
    }
  });
}
