# Tasks

Diese Taskliste leitet sich aus dem Konzept in `docs/pi-mempalace-extension-konzept.md` ab und priorisiert das MVP in einer sinnvollen Umsetzungsreihenfolge.

1. Projektgrundlage aufsetzen: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`, `src/`, `tests/` und `dist/`-Buildziel vorbereiten, damit die Extension sauber nach `dist/index.js` gebundelt werden kann.
2. Gemeinsame Basistypen und Konfiguration anlegen: `src/types.ts` und `src/config.ts` erstellen, YAML-Config plus Env-Overrides modellieren und die MVP-Defaults aus dem Konzept abbilden.
3. Minimalen JSONL-Logger implementieren: `src/logger.ts` mit Append-Logging, Log-Leveln und einfacher Rotation bauen, damit Resolver, CLI, Hooks und Doctor früh nachvollziehbar sind.
4. Windows-first Runtime-Resolver bauen: `src/resolver.ts` mit der definierten Auflösungsreihenfolge, Validierungs-Probeaufruf, UTF-8-Env-Injektion und Cache-Datei für die gefundene MemPalace-Runtime umsetzen.
5. Diagnoseroutine zuerst liefern: `src/doctor.ts` plus Slash-Command `/mempalace:doctor` implementieren, damit Python-, MemPalace-, CLI-, `MEMPAL_DIR`- und Windows-Encoding-Probleme früh sichtbar und behebbar sind.
6. Einheitlichen CLI-Wrapper entwickeln: `src/cli.ts` mit `runMempalace()` bauen, inklusive Timeout, JSON-Parsing, Abort-Signal-Unterstützung und Logging aller CLI-Aufrufe.
7. Extension-Entry verdrahten: `src/index.ts` so aufsetzen, dass Config, Logger und Lazy-Runtime-Resolution initialisiert sowie Commands, Tools und Hooks robust registriert werden, auch wenn MemPalace lokal noch fehlt.
8. Fünf Agent-Tools implementieren: `mempalace_search`, `mempalace_mine`, `mempalace_status`, `mempalace_init` und `mempalace_wake_up` in `src/tools.ts` registrieren, inklusive Graceful-Degradation bei unvollständigem Setup.
9. Slash-Commands für den Nutzerfluss umsetzen: `src/commands.ts` mit Agent-Steering für `init`, `mine`, `search`, `status`, `wake-up` sowie direkten Diagnose-/Hilfekommandos und optionalem Raw-Modus `!` ergänzen.
10. Hooks, Tests und Doku abschließen: Auto-Save-Reminder und Pre-Compaction-Ingest in `src/hooks.ts` bauen, Resolver-/CLI-Tests plus optionalen Integrationstest ergänzen und README/Installationsdoku für ein erstes `0.1.0`-Release fertigstellen.
