import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Regex patterns that indicate git operations targeting main
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

  function isMainBranch(branch: string | null): boolean {
    return branch === "main";
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

    // Get the current branch
    const branch = await getCurrentBranch(ctx.cwd);

    // If not on main, let it through
    if (!isMainBranch(branch)) return;

    // Block the command
    return {
      block: true,
      reason: `Blocked git operation on 'main' branch. Create a feature branch first:\n\n  git checkout -b feat/<your-branch-name>\n\nSee AGENTS.md for project conventions.`,
    };
  });

  pi.on("session_start", async (event, ctx) => {
    const branch = await getCurrentBranch(ctx.cwd);
    if (isMainBranch(branch)) {
      ctx.ui.notify(
        "⚠️ You're on 'main' — git commits to main are blocked. Create a feature branch first.",
        "warning",
      );
    }
  });
}
