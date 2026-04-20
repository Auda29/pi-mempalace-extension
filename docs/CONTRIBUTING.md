# Contributing

Thanks for contributing to `pi-mempalace-extension`.

## Before You Start

- Read [../README.md](../README.md)
- Read [pi-mempalace-extension-konzept.md](./pi-mempalace-extension-konzept.md)
- Prefer small, focused pull requests
- Discuss larger architectural changes before implementing them

## Development Principles

- Keep the extension lean
- Prefer the MemPalace CLI over extra transport layers
- Preserve the Windows-first reliability goal
- Avoid adding framework or infrastructure complexity without a clear payoff
- Keep behavior aligned with the concept unless the change is intentional and documented

## Pull Requests

Please aim to include:

- a clear description of what changed
- the motivation for the change
- testing notes or validation steps
- follow-up work, if something is intentionally incomplete

## Coding Expectations

- Use TypeScript for product code
- Keep files small and responsibilities clear
- Favor straightforward code over clever abstractions
- Add tests for behavior changes when practical
- Update documentation when the concept or public behavior changes

## Issues

When opening an issue, include:

- the current behavior
- the expected behavior
- relevant environment details
- reproduction steps, if applicable

## Communication

Early-stage projects benefit from explicit tradeoff discussions. If a change increases complexity, please explain why the added complexity is worth it.
