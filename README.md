# pi-mempalace-extension

Lean MemPalace integration for the Pi coding agent.

This is a small, Windows-first TypeScript extension that connects Pi to the official MemPalace CLI.

## Status

This project is in MVP implementation and real-world Pi integration.

The technical concept still lives in [docs/pi-mempalace-extension-konzept.md](./docs/pi-mempalace-extension-konzept.md), and the repository now contains a Pi-facing extension entry with runtime resolution, CLI execution, agent tools, lifecycle events, logging and doctor diagnostics.

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
- six Pi tools: `mempalace_search`, `mempalace_mine`, `mempalace_status`, `mempalace_init`, `mempalace_wake_up`, `mempalace_doctor`
- Pi lifecycle integration via `before_agent_start`, `context`, `session_before_compact`, `session_start`, `session_shutdown`
- autosave reminder and pre-compaction ingest logic wired through Pi events
- a focused doctor tool for setup diagnostics
- JSONL logging with rotation
- resolver, CLI and hook-focused tests

## Project Structure

```text
src/
  index.ts
  pi-extension.ts
  resolver.ts
  cli.ts
  tools.ts
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

- Pi should discover the package through `pi.extensions` and load a dedicated extension entry.
- MemPalace actions should be exposed as real Pi tools so the results remain in conversation context.
- Setup feedback should be available through a direct diagnostic tool.
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

4. Publish or link the package so Pi can discover `./dist/pi-extension.js` through the `pi.extensions` manifest entry.

## Configuration

Optional project config lives in `mempalace.yaml`.

Supported environment overrides:

- `MEMPALACE_PYTHON`
- `MEMPALACE_VENV`
- `MEMPAL_DIR`
- `MEMPALACE_LOG_LEVEL`
- `MEMPALACE_AUTOSAVE_DISABLE=1`

## Pi Tools

Pi should expose these directly callable tools:

- `mempalace_search`
- `mempalace_mine`
- `mempalace_status`
- `mempalace_init`
- `mempalace_wake_up`
- `mempalace_doctor`

The extension also hooks into Pi lifecycle events to:

- inject `wake-up` context before agent start
- remind the agent about autosave after repeated user turns
- run `mine` before session compaction when enabled

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
- Register a dedicated Pi extension entry
- Load config from YAML and environment variables

### Phase 3

- Add autosave reminder hook
- Add pre-compaction ingest hook

### Phase 4

- Tests added for resolver, CLI and hook internals
- Validate on real MemPalace installations
- Prepare and publish the first `0.1.0` release

## Release Notes

Before publishing `0.1.0`, verify the real MemPalace CLI subcommands against a live installation:

- `search`
- `mine`
- `status`
- `init`
- `wake-up`

The package is prepared for publish with:

- `npm run check`
- `npm test`
- `npm run build`
- `npm publish`

## Contributing

Contributions are welcome while the MVP is being reviewed and polished.

Please read [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) before opening larger changes.

## Security

If you discover a security issue, please follow [docs/SECURITY.md](./docs/SECURITY.md).

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
