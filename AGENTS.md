# AGENTS.md

This file provides guidance for AI agents working on this repository.

## Project Overview

`@dreadster3/pi-config` is a personal configuration package for the [pi-coding-agent](https://github.com/mariozechner/pi). It bundles skills, extensions, prompts, and themes into a single installable package.

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
- Root `package.json` — only the `pi` config paths should be touched; package name/version are pinned

## Files to Always Update

- `README.md` — when the structure or install instructions change
- `AGENTS.md` — when conventions or structure change
