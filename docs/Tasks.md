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
| 10 | done | Hooks, Tests und Doku abschliessen: Auto-Save-Reminder und Pre-Compaction-Ingest in `src/hooks.ts` bauen, Resolver-/CLI-Tests plus optionalen Integrationstest ergaenzen und README/Installationsdoku fuer ein erstes `0.1.0`-Release fertigstellen. |

## 0.2.0 Polish-Backlog

Nicht-blockierende Hinweise aus den 0.1.0-Reviews. Priorisierung: **Hoch** (UX-spuerbar), **Mittel** (Robustheit), **Niedrig** (interne Sauberkeit).

| # | Prio | Status | Bereich | Task |
|---|---|---|---|---|
| 5  | Mittel  | open | Resolver        | `MEMPALACE_PYTHON` / `MEMPALACE_VENV` direkt aus `env` werden ohne `expandHomeDir` gelesen (`src/resolver.ts:138-139`). `~/...` wuerde scheitern, falls ein Aufrufer `runtimeConfig` nicht durchreicht — defensiv im Resolver expandieren. |
| 6  | Mittel  | open | Resolver/Doctor | `mempalace.__version__`-Annahme im Python-Probe (`src/resolver.ts:16-20`). Bei MemPalace-Varianten ohne `__version__` zeigt der Doctor nur einen generischen Probe-Fehler — spezifischere Meldung liefern. |
| 7  | Hoch    | open | Doctor          | Fehlgeschlagene Command-/Tool-/Hook-Registrierungen loggen nur `warn`. Eigene Doctor-Checks „commands registered" / „tools registered" / „hooks registered" ergaenzen. |
| 8  | Hoch    | open | CLI-Wrapper     | Bei `result.timedOut` wird die generische Meldung „Command timed out after X ms" benutzt; vorhandener stderr wird ignoriert (`src/cli.ts:67-70`). Stderr in Timeout-Meldung einbeziehen. |
| 9  | Niedrig | open | Tools/Commands  | Doppelte Resolver-Aufloesung pro Aufruf — `runMempalace` ruft `resolveRuntime` intern erneut auf, der `runtimePromise` aus `index.ts` wird nicht wiederverwendet. `runtime`-Option in `RunMempalaceOptions` ergaenzen. |
| 10 | Niedrig | open | Tools           | `mempalace_mine` / `mempalace_init` fallen ohne `path` und `cwd` auf `process.cwd()` der Extension zurueck (`src/tools.ts:92,135`). In den Tool-Descriptions explizit erwaehnen. |
| 11 | Hoch    | open | Commands        | Prompt-Templates interpolieren User-Input ohne Quote-Escape (`query: "${query}"` etc. in `src/commands.ts:286-336`); doppelte Anfuehrungszeichen verschmieren das Format. |
| 12 | Mittel  | open | Logger          | `JSON.stringify` wirft bei zyklischem `ctx` → Eintrag geht silent verloren. `safeStringify` als Schutz. |
| 13 | Niedrig | open | Logger          | Cross-Prozess-Rotation ist nicht atomar — relevant nur bei mehreren parallel laufenden Extension-Instanzen. |
| 14 | Niedrig | open | Hosts           | `tryCallWithSingleArg` / `tryRegisterObjectCall` / `tryRegisterPositionalCall` fangen nur synchrone Errors; rejected Promises aus Host-APIs werden orphan. |
| 15 | Hoch    | open | `index.ts`      | Kein Top-Level Try/Catch um `loadConfig` / `initLogger`. YAML-Syntaxfehler in `mempalace.yaml` wuerden den Init crashen — Sicherheitsnetz mit Fallback auf Defaults ergaenzen. |
| 16 | Mittel  | open | Config          | Schema-Validierung des YAML fehlt — `RawMempalaceConfig` wird nur gecastet, falsche Typen (z. B. `threshold: "x"`) liefern keine Warnung. |
