import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

interface InstructionsFile {
  filePath: string;
  content: string;
}

/**
 * Look for copilot-instructions.md in two well-known locations inside `cwd`:
 *   1. `.github/copilot-instructions.md`  (standard VS Code Copilot location)
 *   2. `copilot-instructions.md`          (root-level fallback)
 */
function findInstructions(cwd: string): InstructionsFile[] {
  const candidates: InstructionsFile[] = [];

  for (const relative of [".github/copilot-instructions.md", "copilot-instructions.md"]) {
    const filePath = path.join(cwd, relative);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, "utf8").trim();
      if (content) candidates.push({ filePath, content });
    } catch {
      // Skip unreadable files
    }
  }

  return candidates;
}

export default function (pi: ExtensionAPI) {
  // Cache discovered files for the lifetime of the session.
  // Re-discovered on session_start (new session, reload, fork, etc.).
  let instructions: InstructionsFile[] = [];

  pi.on("session_start", async (_event, ctx) => {
    instructions = findInstructions(ctx.cwd);

    if (instructions.length > 0) {
      const labels = instructions.map((f) => `  ${path.relative(ctx.cwd, f.filePath)}`);
      ctx.ui.setWidget("copilot-instructions", ["[Copilot Instructions]", ...labels]);
    } else {
      ctx.ui.setWidget("copilot-instructions", []);
    }
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (instructions.length === 0) return;

    const sections = instructions
      .map(
        ({ filePath, content }) =>
          `<context_file path="${filePath}">\n${content}\n</context_file>`,
      )
      .join("\n\n");

    return {
      systemPrompt: `${event.systemPrompt}\n\n${sections}`,
    };
  });
}
