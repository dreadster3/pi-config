# pi-config

Personal configuration for the [pi-coding-agent](https://github.com/earendil-works/pi) — skills, extensions, prompts, and themes.

## Structure

```
.
├── package.json          # pi-config manifest (installable via `pi install git:...`)
├── extensions/           # Custom extensions (.ts)
├── skills/               # Skills (.md + any supporting code)
│   └── searxng-search/   # Example: skill with its own deps
│       ├── SKILL.md
│       ├── package.json
│       └── search.js
├── prompts/              # Prompt templates (.md)
│   └── review-loop.md    # Scout → reviewers → planner → worker loop with todo-tracked plan
└── themes/               # Theme definitions (.json)
```

## Install

```bash
pi install git:github.com/dreadster3/pi-config
```

## Extensions

| Extension              | Description                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `gitignore-protection` | Blocks pi from reading/writing gitignored files and folders, except inside `.pi/` directories. Uses `git check-ignore` for accurate matching. |
| `git-main-protection`  | Prevents git commits and pushes on the default branch.                                                                                        |
| `confirm-destructive`  | Prompts for confirmation before destructive session actions (clear, switch, fork).                                                            |
| `copilot-instructions` | Loads `.github/copilot-instructions.md` into the system prompt.                                                                               |
| `tools`                | Provides a `/tools` command to enable/disable tools interactively.                                                                            |

## Adding a skill

Drop a skill into `skills/` with a `SKILL.md` at its root. If it needs npm deps, add a `package.json` alongside.
