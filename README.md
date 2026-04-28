# pi-config

Personal configuration for the [pi-coding-agent](https://github.com/mariozechner/pi) — skills, extensions, prompts, and themes.

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
└── themes/               # Theme definitions (.json)
```

## Install

```bash
pi install git:github.com/dreadster3/pi-config
```

## Adding a skill

Drop a skill into `skills/` with a `SKILL.md` at its root. If it needs npm deps, add a `package.json` alongside.
