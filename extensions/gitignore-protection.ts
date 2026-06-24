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
 *
 * Uses `git check-ignore` for accurate matching against all gitignore rules
 * (nested `.gitignore` files, negation patterns, etc.).
 *
 * Limitation: `bash` commands are not intercepted because reliably detecting
 * file-reading commands (cat, head, tail, awk, etc.) from arbitrary shell
 * pipelines is impractical.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
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

    // bash: not intercepted — see limitation note in file header
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
