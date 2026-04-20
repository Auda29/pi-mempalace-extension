# Tasks

Diese Taskliste leitet sich aus dem Konzept in `docs/pi-mempalace-extension-konzept.md` ab und priorisiert das MVP in einer sinnvollen Umsetzungsreihenfolge.

| # | Status | Task |
|---|---|---|
| 1 | done | Projektgrundlage aufsetzen: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`, `src/`, `tests/` und `dist/`-Buildziel vorbereiten, damit die Extension sauber nach `dist/index.js` gebundelt werden kann. |
| 2 | done | Gemeinsame Basistypen und Konfiguration anlegen: `src/types.ts` und `src/config.ts` erstellen, YAML-Config plus Env-Overrides modellieren und die MVP-Defaults aus dem Konzept abbilden. |
| 3 | done | Minimalen JSONL-Logger implementieren: `src/logger.ts` mit Append-Logging, Log-Leveln und einfacher Rotation bauen, damit Resolver, CLI, Hooks und Doctor frueh nachvollziehbar sind. |
| 4 | done | Windows-first Runtime-Resolver bauen: `src/resolver.ts` mit der definierten Aufloesungsreihenfolge, Validierungs-Probeaufruf, UTF-8-Env-Injektion und Cache-Datei fuer die gefundene MemPalace-Runtime umsetzen. |
| 5 | done | Diagnoseroutine zuerst liefern: `src/doctor.ts` plus Slash-Command `/mempalace:doctor` implementieren, damit Python-, MemPalace-, CLI-, `MEMPAL_DIR`- und Windows-Encoding-Probleme frueh sichtbar und behebbar sind. |
| 6 | done | Einheitlichen CLI-Wrapper entwickeln: `src/cli.ts` mit `runMempalace()` bauen, inklusive Timeout, JSON-Parsing, Abort-Signal-Unterstuetzung und Logging aller CLI-Aufrufe. |
| 7 | done | Extension-Entry verdrahten: `src/index.ts` so aufsetzen, dass Config, Logger und Lazy-Runtime-Resolution initialisiert sowie Commands, Tools und Hooks robust registriert werden, auch wenn MemPalace lokal noch fehlt. |
| 8 | done | Fuenf Agent-Tools implementieren: `mempalace_search`, `mempalace_mine`, `mempalace_status`, `mempalace_init` und `mempalace_wake_up` in `src/tools.ts` registrieren, inklusive Graceful-Degradation bei unvollstaendigem Setup. |
| 9 | done | Slash-Commands fuer den Nutzerfluss umsetzen: `src/commands.ts` mit Agent-Steering fuer `init`, `mine`, `search`, `status`, `wake-up` sowie direkten Diagnose-/Hilfekommandos und optionalem Raw-Modus `!` ergaenzen. |
| 10 | open | Hooks, Tests und Doku abschliessen: Auto-Save-Reminder und Pre-Compaction-Ingest in `src/hooks.ts` bauen, Resolver-/CLI-Tests plus optionalen Integrationstest ergaenzen und README/Installationsdoku fuer ein erstes `0.1.0`-Release fertigstellen. |
