---
description: Scout → review → todo-tracked plan → worker execution loop
---

Run a parent-orchestrated implementation loop for the requested work. The loop has four ordered phases — **scout → reviewers → planner → worker** — and every subagent runs in fresh context so no agent inherits the parent conversation or any other agent's history. Keep the parent session as the loop controller and final decision-maker. Child subagents must receive concrete role-specific tasks; they must not run subagents or manage the loop themselves.

Default to a single review round. If `$ARGUMENTS` includes `--rounds <n>` (or `/review-loop n`), use that cap instead; otherwise the loop stops after one clean pass. Count a round as one full scout → reviewers → planner → worker cycle. Stop early when reviewers find no blockers or fixes worth doing now.

Use the `subagent` tool. Use only one writer against the active worktree at a time. For an initial chain, pass `async: true` so the main chat is unblocked; do not set `clarify: true` unless the slash command invocation explicitly requested the foreground clarify UI.

All four subagents must run with `context: "fresh"`. Fresh sessions start with empty branches, so the parent cannot rely on shared conversation state — every handoff is through a file artifact. The `todo` tool stays in the parent session only; subagents do not get it, and the parent's todo overlay is the canonical plan view. The planner writes the todo list into `plan.md` as a structured section, and the parent transcribes it into its own `todo` calls so the user sees the list above the editor. The worker reads the plan and walks the items one at a time.

All shared artifacts live under `./review-loop/` in the worktree, written by the agent that owns them and read by downstream agents:

- `review-loop/context.md` — scout recon (read by reviewers, planner, worker)
- `review-loop/review-<angle>.md` — one per reviewer angle (read by planner, parent)
- `review-loop/plan.md` — planner's ordered todo list, including the canonical `## Todo list` section (read by parent to seed todos, then by worker)
- `review-loop/worker-summary.md` — final worker report (read by parent)

Pass `output: "<path>"` and `outputMode: "file-only"` on every subagent so the parent only sees compact references. Do not pass duplicate output paths to parallel agents. When a task is review-only, say "do not modify project/source files" rather than "do not write files" so the child knows the configured output artifact is allowed.

## Phase 1 — Scout

Launch one async fresh-context `scout` agent. Task must include the original work request, the primary scope (URL, file, issue, plan, or diff), and an explicit instruction to write `review-loop/context.md`. The scout returns compressed codebase context: relevant entry points, key types/functions, data flow, files likely to need changes, constraints, and open questions. Cite exact file paths and line ranges.

If the scout surfaces missing requirements or blocking questions, pause and ask the user with `ask_user_question` before continuing. Do not let later phases guess at scope.

## Phase 2 — Reviewers

Launch 2–3 async fresh-context `reviewer` agents in parallel. Each reviewer reads `review-loop/context.md` and the original work request, then writes one file: `review-loop/review-correctness.md`, `review-loop/review-tests.md`, `review-loop/review-simplicity.md` (or other angle names that fit the work — security, performance, API contracts). Reviewers must not edit project source files, must not run their own subagents, and must not relitigate the scout's findings — they inspect the existing code through the scout's recon and report concrete, evidence-backed issues with file/line references. Three strong angles beat many vague ones.

Wait for all reviewers to complete before moving to the planner. The parent's job between phases is to keep moving on local inspection, but do not start the planner until every reviewer file exists.

## Phase 3 — Planner

Launch one async fresh-context `planner` agent. The planner task must include:
- the original work request
- the path `review-loop/context.md`
- the paths of every reviewer file in `review-loop/review-*.md`
- the output path `review-loop/plan.md`
- the explicit instruction to render a `## Todo list` section at the top of `plan.md`: a numbered, ordered, dependency-aware list of actionable items, each with a `Subject`, `Description`, `File(s)` it touches, and `Acceptance` (how to verify). The planner does not call the `todo` tool — it just writes the list into the file.
- the explicit instruction to call out unapproved product, scope, or architecture decisions in a `## Decisions needed` section so the parent can ask the user before the worker starts.

The planner turns the reviewer findings into a small, ordered, actionable set of tasks. Each task names the file, the change, the validation, and the rough order it should be tackled.

After the planner returns, **the parent must call `todo` itself** to mirror the planner's todo list on its own branch. Walk the `## Todo list` section top-to-bottom and call `todo create` for each item, using the planner's `Subject` for `subject`, the `Description` for `description`, the present-continuous form of the subject for `activeForm`, and the planner's stated dependencies for `blockedBy`. This is the canonical list — the parent's overlay reflects it, and the worker reads the same file to know what to do.

If the planner reports unapproved decisions in `## Decisions needed`, pause and ask the user before launching the worker. If a reviewer finding contradicts another, the parent's synthesis decides what goes onto the todo list — the planner does not arbitrate reviewer disagreement on its own.

## Phase 4 — Worker

Launch one async fresh-context `worker` agent. The worker task must include:
- the original work request
- the path `review-loop/context.md`
- the path `review-loop/plan.md` (which already contains the `## Todo list` section)
- the output path `review-loop/worker-summary.md`

The worker does not receive the `todo` tool — it works through the `## Todo list` section in `plan.md` directly. The worker is the only agent in this loop that may edit project source files. Reviewers, the planner, and the scout are all read-only against source.

The worker walks the list one item at a time: read the next item, do the work, run focused validation, then move to the next. The worker should track its own progress locally — either by editing `review-loop/plan.md` to check off items (e.g., `[x]` / `[ ]`) or by maintaining a `review-loop/progress.md` scratch file. Do not instruct the worker to call the `todo` tool; the parent's todo overlay is the only canonical todo view, and the parent's list is already what the user sees.

If a todo is blocked by an unresolvable error, the worker keeps that item open, records the blocker in `review-loop/worker-summary.md`, and creates a follow-up todo in the plan file rather than silently completing it. At the end, write `review-loop/worker-summary.md` with: implemented changes per todo, changed files, validation evidence per todo, open risks, and the final state of every todo from `plan.md`.

## Stop conditions

Stop the loop and summarize when any of these is true:

- the worker completes every todo and the worker-summary reports no remaining blockers
- the planner surfaces an unapproved product, scope, or architecture decision
- the review-round cap is reached
- the worker reports it cannot make progress without an unapproved decision

On completion, inspect the final diff yourself, run or confirm focused validation where appropriate, mark completed todos as `completed` via `todo update` to keep the overlay in sync with reality, and summarize: rounds run, scout findings, reviewer angles and accepted fixes, todo list with completion state, validation evidence, remaining deferred items, and why the loop stopped.

Additional target, implementation request, max-round cap, or review focus from the slash command invocation: $@
