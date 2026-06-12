# AGENTS.md

This file provides guidance for AI agents working on this repository.

## Project Overview

`@dreadster3/pi-config` is a personal configuration package for the [pi-coding-agent](https://github.com/earendil-works/pi). It bundles skills, extensions, prompts, and themes into a single installable package.

## Repository Structure

```
.
├── package.json          # pi-config manifest (installable via `pi install git:...`)
├── AGENTS.md             # This file
├── README.md             # User-facing documentation
├── .gitignore
├── extensions/           # Custom TypeScript extensions
│   └── *.ts
├── skills/               # Skills — each skill is its own directory
│   ├── searxng-search/   # Skill with its own deps (SKILL.md + package.json + code)
│   └── <skill-name>/     # New skills go here
│       ├── SKILL.md      # Required: skill definition
│       ├── package.json  # Optional: if the skill needs npm dependencies
│       └── *.js          # Optional: supporting code
├── prompts/              # Prompt templates (.md)
│   └── *.md
└── themes/               # Theme definitions (.json)
    └── *.json
```

## Key Conventions

### Adding a skill

1. Create a directory under `skills/<name>/`
2. Add a `SKILL.md` at the root of that directory
3. If the skill needs npm dependencies, add a `package.json` alongside
4. Do **not** commit `node_modules/` — it is gitignored

### Adding an extension

1. Create a file under `extensions/<name>.ts`
2. Export a default function that receives `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("bash", event)) {
      // Hook into bash tool calls
    }
  });
}
```

1. The extension is auto-discovered from the `extensions/` directory
2. Run `npm run typecheck` to verify types before committing

### npm Scripts

- `npm install` — Install dependencies (including `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `@earendil-works/pi-tui` for type hints)
- `npm run typecheck` — Run TypeScript type checking (runs automatically on commit)
- `npm run format` — Run Prettier to format all files

### package.json

The root `package.json` is the pi-config manifest. It declares the four config directories and includes the `pi-package` keyword so `pi install git:...` can discover and install it.

Each skill may also have its own `package.json` if it has dependencies.

### Branching

- **Never commit directly to `main`.**
- Use descriptive branch names: `feat/<name>`, `fix/<name>`, `refactor/<name>`
- Create a PR for all changes.

### Naming

- Directories: kebab-case (e.g., `searxng-search`)
- Files: follow the convention of the containing directory
- Skills: each skill is a directory, not a flat file

## Install

```bash
pi install git:github.com/dreadster3/pi-config
```

## Files to Never Modify

- `.gitignore` — unless adding new ignore patterns
- Root `package.json` `name` field — package identity is pinned

## Files to Always Update

- `README.md` — when the structure or install instructions change
- `AGENTS.md` — when conventions or structure change
- Root `package.json` `version` field — on every PR, see [Versioning](#versioning)

## Versioning

The root `package.json` `version` field must be bumped on every PR. Bump the version in the same commit as the change — do not split it into a separate chore commit.

Use [Semantic Versioning](https://semver.org/) and align the bump type with the branch prefix:

| Branch prefix       | Version bump    | Example: `1.2.2` → |
| ------------------- | --------------- | ------------------ |
| `feat/*`            | minor (`x.Y.0`) | `1.3.0`            |
| `fix/*`             | patch (`x.y.Z`) | `1.2.3`            |
| `refactor/*`        | patch (`x.y.Z`) | `1.2.3`            |
| `chore/*`, `docs/*` | patch (`x.y.Z`) | `1.2.3`            |

### Breaking changes

A `!` after the type or scope in a [conventional commit](https://www.conventionalcommits.org/) subject is the standard signal for a breaking change. Both forms are supported and **override** the default bump for the branch prefix:

- `feat!: ...` or `feat(api)!: ...` on a `feat/*` branch
- `fix!: ...` on a `fix/*` branch
- `refactor!: ...` on a `refactor/*` branch
- Any other `type!:` or `type(scope)!:` subject

When the commit subject carries `!`, bump the **major** version (`X.0.0`) instead of the default minor or patch. Reflect the breaking change in `package.json` and call it out explicitly in the PR description. The `pi-config` manifest is pre-1.0, so major bumps are rare — coordinate before opening the PR.

If a single PR contains multiple change types, use the highest-severity bump (major > minor > patch).

Always read `package.json` before opening a PR to confirm the current version; do not assume the value from a prior session.
