# pi-mempalace-extension

Lean MemPalace integration for the Pi coding agent.

This repository currently starts from a technical concept and is intended to become a small, Windows-first TypeScript extension that connects Pi to the official MemPalace CLI.

## Status

This project is in the concept and scaffolding phase.

The current source of truth is [docs/pi-mempalace-extension-konzept.md](./docs/pi-mempalace-extension-konzept.md).

## Goals

- Keep the implementation small and maintainable
- Use the MemPalace CLI as the single transport layer
- Preserve tool results in Pi conversation history via agent-driven workflows
- Prioritize Windows reliability while staying compatible with Linux and macOS
- Ship a practical MVP before adding advanced features

## Planned Scope

The concept describes an extension with:

- a cached Python and CLI runtime resolver
- a single MemPalace CLI wrapper
- five agent tools: `search`, `mine`, `status`, `init`, `wake-up`
- six slash commands, split into action and diagnosis commands
- two lifecycle hooks: autosave reminder and pre-compaction ingest
- a focused doctor command for setup diagnostics

## Planned Project Structure

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

The planned architecture follows a few strong constraints:

- Action commands should steer the Pi agent to call MemPalace tools so the results remain in conversation context.
- Diagnosis commands should run directly for fast setup feedback.
- The extension should rely on the MemPalace CLI only, not MCP bridging or internal Python imports.
- The runtime should be lazily resolved so Pi can still start even when MemPalace is not installed yet.

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

## Getting Started

Implementation has not been added yet. To begin development:

1. Review the concept document in [`docs/`](./docs/README.md).
2. Scaffold the TypeScript project files described there.
3. Build the runtime resolver and doctor command first.
4. Test against a real MemPalace installation on Windows.

## Contributing

Contributions are welcome while the project is still taking shape.

Please read [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) before opening larger changes.

## Security

If you discover a security issue, please follow [docs/SECURITY.md](./docs/SECURITY.md).

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
