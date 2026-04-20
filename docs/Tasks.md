# Tasks

Diese Taskliste leitet sich aus dem Konzept in `docs/pi-mempalace-extension-konzept.md` ab und priorisiert das MVP in einer sinnvollen Umsetzungsreihenfolge.

| # | Status | Task |
|---|---|---|
| 1 | done | Projektgrundlage aufsetzen: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`, `src/`, `tests/` und `dist/`-Buildziel vorbereiten, damit die Extension sauber nach `dist/index.js` gebundelt werden kann. |
| 2 | done | Gemeinsame Basistypen und Konfiguration anlegen: `src/types.ts` und `src/config.ts` erstellen, YAML-Config plus Env-Overrides modellieren und die MVP-Defaults aus dem Konzept abbilden. |
| 3 | done | Minimalen JSONL-Logger implementieren: `src/logger.ts` mit Append-Logging, Log-Leveln und einfacher Rotation bauen, damit Resolver, CLI, Hooks und Doctor frueh nachvollziehbar sind. |
| 4 | done | Windows-first Runtime-Resolver bauen: `src/resolver.ts` mit der definierten Aufloesungsreihenfolge, Validierungs-Probeaufruf, UTF-8-Env-Injektion und Cache-Datei fuer die gefundene MemPalace-Runtime umsetzen. |
| 5 | done | Diagnoseroutine zuerst liefern: `src/doctor.ts` plus Diagnose-Integration fuer Python-, MemPalace-, CLI-, `MEMPAL_DIR`- und Windows-Encoding-Probleme implementieren. |
| 6 | done | Einheitlichen CLI-Wrapper entwickeln: `src/cli.ts` mit `runMempalace()` bauen, inklusive Timeout, JSON-Parsing, Abort-Signal-Unterstuetzung und Logging aller CLI-Aufrufe. |
| 7 | done | Extension-Entry verdrahten: `src/index.ts` so aufsetzen, dass Config, Logger und Lazy-Runtime-Resolution initialisiert werden und die Core-Runtime fuer Pi bereitsteht. |
| 8 | done | Fuenf Agent-Tools implementieren: `mempalace_search`, `mempalace_mine`, `mempalace_status`, `mempalace_init` und `mempalace_wake_up` in `src/tools.ts` registrieren, inklusive Graceful-Degradation bei unvollstaendigem Setup. |
| 9 | done | Nutzerfluss fuer Pi vorbereiten: Tool-Steering, Diagnosepfade und der erste Command-Ansatz fuer den MVP umsetzen. |
| 10 | done | Hooks, Tests und Doku abschliessen: Auto-Save-Reminder und Pre-Compaction-Ingest in `src/hooks.ts` bauen, Resolver-/CLI-/Hook-Tests plus optionalen Integrationstest ergaenzen und README/Installationsdoku fuer ein erstes Release fertigstellen. |

## 0.2.0 Polish-Backlog

Nicht-blockierende Hinweise aus den 0.1.0-Reviews. Priorisierung: **Hoch** (UX-spuerbar), **Mittel** (Robustheit), **Niedrig** (interne Sauberkeit).

Stand nach `0.1.6`: Einige High-Priority- und Robustheits-Punkte wurden bereits vorgezogen und sind hier entsprechend als `done` markiert.

| # | Prio | Status | Bereich | Task |
|---|---|---|---|---|
| 5  | Mittel  | done | Resolver | `MEMPALACE_PYTHON` / `MEMPALACE_VENV` direkt aus `env` werden ohne `expandHomeDir` gelesen. `~/...` wird jetzt defensiv direkt im Resolver expandiert. |
| 6  | Mittel  | open | Resolver/Doctor | Die `mempalace.__version__`-Annahme im Python-Probe sollte durch eine spezifischere Fehlermeldung oder robustere Probe ersetzt werden. |
| 7  | Hoch    | done | Doctor | Fehlgeschlagene Tool- oder Event-Registrierungen loggen nicht mehr nur `warn`. Der Doctor enthaelt jetzt einen eigenen Check fuer registrierte Pi-Tools und Hooks. |
| 8  | Hoch    | done | CLI-Wrapper | Bei `result.timedOut` wird vorhandener `stderr` jetzt in die Timeout-Meldung einbezogen. |
| 9  | Niedrig | done | Tools/Events | Doppelte Resolver-Aufloesung pro Aufruf vermeiden. `runMempalace()` akzeptiert jetzt eine bereits aufgeloeste `runtime` und die Pi-Integration nutzt diese Wiederverwendung. |
| 10 | Niedrig | done | Tools | `mempalace_mine` / `mempalace_init` fallen ohne `path` und `cwd` auf `process.cwd()` der Extension zurueck. Dieser Fallback ist jetzt in den Tool-Descriptions explizit dokumentiert. |
| 11 | Hoch    | open | Commands | Prompt-Templates interpolieren User-Input ohne Quote-Escape. Falls der Command-Pfad wieder aktiviert wird, sollten Eingaben sauber escaped werden. |
| 12 | Mittel  | done | Logger | Zyklische Logger-Kontexte verlieren keine Eintraege mehr. `safeStringify` schuetzt jetzt vor stillen JSON-Fehlern. |
| 13 | Niedrig | open | Logger | Cross-Prozess-Rotation ist nicht atomar. Das ist nur bei mehreren parallel laufenden Extension-Instanzen relevant. |
| 14 | Niedrig | done | Hosts | Pi-Event-Handler laufen jetzt ueber einen zentralen Safe-Wrapper, der neben synchronen Fehlern auch Promise-Rejections defensiv behandelt und loggt. |
| 15 | Hoch    | done | Bootstrap | Der Pi-Bootstrap ist fehlertoleranter und degradiert bei Config- oder Init-Problemen sauberer, statt unklar abzubrechen. |
| 16 | Mittel  | done | Config | Die Config-Normalisierung ist defensiver. Falsche YAML-Typen fallen jetzt mit Warnings auf Defaults zurueck. |
