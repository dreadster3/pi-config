import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  async function getDefaultBranch(cwd: string): Promise<string | null> {
    try {
      const result = await pi.exec(
        "git",
        ["symbolic-ref", "refs/remotes/origin/HEAD"],
        { cwd, timeout: 5000 },
      );
      if (result.code === 0 && result.stdout.trim()) {
        // refs/remotes/origin/main -> main
        return result.stdout.trim().split("/").pop();
      }
    } catch {
      // Fallback: try to get default branch from remote
    }
    return null;
  }

  // Regex patterns that indicate git operations targeting the default branch
  const MAIN_COMMIT_PATTERNS = [
    /git\s+commit/,
    /git\s+push\s+.*main/,
    /git\s+push\s+origin\s+main/,
    /git\s+checkout\s+main/,
    /git\s+merge\s+main/,
    /git\s+rebase\s+main/,
  ];

  async function getCurrentBranch(cwd: string): Promise<string | null> {
    try {
      const result = await pi.exec(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        {
          cwd,
          timeout: 5000,
        },
      );
      if (result.code === 0 && result.stdout.trim()) {
        return result.stdout.trim();
      }
    } catch {
      // Not a git repo or git error
    }
    return null;
  }

  function matchesPattern(command: string): boolean {
    return MAIN_COMMIT_PATTERNS.some((pattern) => pattern.test(command));
  }

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command || "";

    // Only check git-related commands
    if (!command.includes("git")) return;

    // Check if the command matches our patterns
    if (!matchesPattern(command)) return;

    // Get the current branch and default branch
    const branch = await getCurrentBranch(ctx.cwd);
    const defaultBranch = await getDefaultBranch(ctx.cwd);

    // If not on default branch, let it through
    if (!defaultBranch || branch !== defaultBranch) return;

    // Block the command
    return {
      block: true,
      reason: `Blocked git operation on '${defaultBranch}' branch. Create a feature branch first:\n\n  git checkout -b feat/<your-branch-name>\n\nSee AGENTS.md for project conventions.`,
    };
  });

  pi.on("session_start", async (event, ctx) => {
    const branch = await getCurrentBranch(ctx.cwd);
    const defaultBranch = await getDefaultBranch(ctx.cwd);
    if (defaultBranch && branch === defaultBranch) {
      ctx.ui.notify(
        `⚠️ You're on '${defaultBranch}' — git commits are blocked. Create a feature branch first.`,
        "warning",
      );
    }
  });
}
