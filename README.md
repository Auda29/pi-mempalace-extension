# pi-mempalace-extension

Lean MemPalace integration for the Pi coding agent.

This is a small, Windows-first TypeScript extension that connects Pi to the official MemPalace CLI.

## Status

This project is in MVP implementation and review.

The technical concept still lives in [docs/pi-mempalace-extension-konzept.md](./docs/pi-mempalace-extension-konzept.md), but the repository now contains a working implementation skeleton with runtime resolution, CLI execution, tools, commands, hooks, logging and doctor diagnostics.

## Goals

- Keep the implementation small and maintainable
- Use the MemPalace CLI as the single transport layer
- Preserve tool results in Pi conversation history via agent-driven workflows
- Prioritize Windows reliability while staying compatible with Linux and macOS
- Ship a practical MVP before adding advanced features

## Implemented Scope

The current codebase already includes:

- a cached Python and CLI runtime resolver
- a single MemPalace CLI wrapper
- five agent tools: `search`, `mine`, `status`, `init`, `wake-up`
- slash commands for diagnosis, agent-steering and raw execution
- two lifecycle hooks: autosave reminder and pre-compaction ingest
- a focused doctor command for setup diagnostics
- JSONL logging with rotation
- initial resolver and CLI-focused tests

## Project Structure

```text
src/
  index.ts
  resolver.ts
  cli.ts
  tools.ts
  commands.ts
  hooks.ts
  doctor.ts
  config.ts
  logger.ts
  types.ts
tests/
dist/
```

## Architecture Summary

The architecture follows a few strong constraints:

- Action commands should steer the Pi agent to call MemPalace tools so the results remain in conversation context.
- Diagnosis commands should run directly for fast setup feedback.
- The extension should rely on the MemPalace CLI only, not MCP bridging or internal Python imports.
- The runtime should be lazily resolved so Pi can still start even when MemPalace is not installed yet.

## Installation

1. Install project dependencies:

```bash
npm install
```

2. Build the extension bundle:

```bash
npm run build
```

3. Make sure MemPalace is available either through:

- `MEMPALACE_PYTHON`
- `MEMPALACE_VENV`
- the default `~/.mempalace/.venv`
- `py -3`, `python3`, `python`
- or a standalone `mempalace` CLI

4. Install or link the built extension into Pi using your preferred local extension workflow.

## Configuration

Optional project config lives in `mempalace.yaml`.

Supported environment overrides:

- `MEMPALACE_PYTHON`
- `MEMPALACE_VENV`
- `MEMPAL_DIR`
- `MEMPALACE_LOG_LEVEL`
- `MEMPALACE_AUTOSAVE_DISABLE=1`

## Commands

Direct diagnosis:

- `/mempalace:help`
- `/mempalace:doctor`

Agent-steered actions:

- `/mempalace:init`
- `/mempalace:mine`
- `/mempalace:search`
- `/mempalace:status`
- `/mempalace:wake-up`

Raw direct execution:

- `/mempalace:init!`
- `/mempalace:mine!`
- `/mempalace:search!`
- `/mempalace:status!`
- `/mempalace:wake-up!`

## Development

Type-check:

```bash
npm run check
```

Run tests:

```bash
npm test
```

Run the optional integration suite:

```bash
MEMPALACE_INTEGRATION_TEST=1 npm test
```

## Roadmap

### Phase 1

- Set up the repository skeleton
- Implement runtime resolution
- Implement CLI execution wrapper
- Add logging
- Add the extension entry point
- Build the first `/mempalace:doctor` command

### Phase 2

- Register tools
- Register slash commands
- Load config from YAML and environment variables

### Phase 3

- Add autosave reminder hook
- Add pre-compaction ingest hook

### Phase 4

- Add tests
- Validate on real MemPalace installations
- Publish the first `0.1.0` release

## Contributing

Contributions are welcome while the MVP is being reviewed and polished.

Please read [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) before opening larger changes.

## Security

If you discover a security issue, please follow [docs/SECURITY.md](./docs/SECURITY.md).

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
