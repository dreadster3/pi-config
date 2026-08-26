import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let protectionEnabled = true;

  async function getDefaultBranch(cwd: string): Promise<string | null> {
    try {
      const result = await pi.exec(
        "git",
        ["symbolic-ref", "refs/remotes/origin/HEAD"],
        { cwd, timeout: 5000 },
      );
      const ref = result.stdout.trim();
      const prefix = "refs/remotes/origin/";
      if (result.code === 0 && ref.startsWith(prefix)) {
        return ref.slice(prefix.length) || null;
      }
    } catch {
      // No origin/HEAD available
    }
    return null;
  }

  // Regex patterns that indicate git operations targeting the default branch
  function matchesPattern(command: string, defaultBranch: string): boolean {
    const escapedBranch = defaultBranch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      /git\s+commit\b/,
      /git\s+push\b/,
      new RegExp(
        `git\\s+(?:checkout|merge|rebase)\\s+${escapedBranch}(?:\\s|$)`,
      ),
    ];

    return patterns.some((pattern) => pattern.test(command));
  }

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

  pi.registerCommand("git-protection", {
    description: "Toggle default branch git protection",
    handler: async (_args, ctx) => {
      protectionEnabled = !protectionEnabled;
      ctx.ui.notify(
        `Git default branch protection ${protectionEnabled ? "enabled" : "disabled"}`,
        "info",
      );
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    if (!protectionEnabled) return;

    const command = event.input.command || "";

    // Only check git-related commands
    if (!command.includes("git")) return;

    // Get the default branch and check if the command matches its patterns
    const defaultBranch = await getDefaultBranch(ctx.cwd);
    if (!defaultBranch || !matchesPattern(command, defaultBranch)) return;

    const branch = await getCurrentBranch(ctx.cwd);

    // If not on default branch, let it through
    if (branch !== defaultBranch) return;

    // Block the command
    return {
      block: true,
      reason: `Blocked git operation on '${defaultBranch}' branch. Create a feature branch first:\n\n  git checkout -b feat/<your-branch-name>\n\nSee AGENTS.md for project conventions.`,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!protectionEnabled) return;

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
