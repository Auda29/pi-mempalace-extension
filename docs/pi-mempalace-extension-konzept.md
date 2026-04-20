# pi-mempalace-extension — technisches Konzept

**Status:** MVP-Design-Entwurf
**Ziel-Plattform:** Pi Coding Agent (badlogic/pi-mono), primär Windows, sekundär Linux/macOS
**Backend:** Offizielles MemPalace Python-Paket (PyPI `mempalace`, Repo `MemPalace/mempalace`)

---

## 1. Designphilosophie

Drei Leitsätze, die jede Architekturentscheidung durchziehen:

1. **Agent sieht, was der Agent braucht.** Action-Commands (`search`, `mine`, `init`, `status`, `wake-up`) laufen über ein Steering-Message-an-Pi-Pattern: die Extension injiziert eine klare Anweisung an den Agenten, das passende Tool mit den passenden Parametern aufzurufen. Dadurch landen Tool-Call und Tool-Result in der Conversation-History, und der Agent kann mit den Ergebnissen weiterarbeiten — das ist bei `search` essenziell, bei `mine` und `init` wertvoll, weil der Agent den frischen Kontext dann kennt. Diagnose-Commands (`doctor`, `help`) laufen dagegen direkt, ohne Agent-Beteiligung, weil da keine Conversation-Kontextualisierung gebraucht wird und du schnell Setup-Infos willst.
2. **Ein Transport, nicht drei.** Nur CLI. Kein MCP-Server-Spawn, kein Python-Fallback-Import, kein dynamisches Tool-Discovery. MemPalace hat eine stabile, dokumentierte CLI — die reicht. Wenn die CLI ein Feature nicht hat, wird es in der Extension nicht unterstützt. Das ist eine Feature, kein Bug.
3. **Windows-First, nicht Windows-auch-irgendwie.** Der Python-Resolver, die Encoding-Behandlung und die Pfadlogik werden für Windows gebaut und dürfen auf Unix ebenfalls funktionieren. Nicht umgekehrt.

**Was bewusst wegfällt** gegenüber `juhas96/mempalace-pi`:

- MCP-Brücke (`mcp-client.ts`, ~322 LOC)
- Dynamisches Tool-Discovery mit `register/unregister`
- Circuit-Breaker für MCP-Transport
- Direktimport von `mempalace.mcp_server.TOOLS`
- Claude-Plugin-Parity als Designziel
- In-App-Toast-Management für Hook-Feedback
- `mempalace_hook_settings`-Abbildung auf Pi-Toasts

**Was bewusst bleibt** (gute Ideen, schlanker umgesetzt):

- Doctor-Command für Setup-Diagnose
- `MEMPAL_DIR` → Session-Dir → `cwd` Auflösungsreihenfolge für Mine-Target
- Pre-Compaction Ingest-Hook
- Auto-Save-Reminder nach N User-Messages

**Zielgröße:** ≤ 600 LOC TypeScript, kompiliert zu einem `dist/index.js`.

---

## 2. Projektstruktur

```
pi-mempalace-extension/
├── src/
│   ├── index.ts           # Pi-Extension Entry, registriert alles
│   ├── resolver.ts        # Python-/Binary-Auflösung (cached)
│   ├── cli.ts             # execa-Wrapper um mempalace CLI
│   ├── tools.ts           # Agent-Tool-Registrierung
│   ├── commands.ts        # Slash-Command-Handler
│   ├── hooks.ts           # session/turn/compact Lifecycle-Hooks
│   ├── doctor.ts          # Diagnose-Routine
│   ├── config.ts          # Config-Loading aus mempalace.yaml + env
│   ├── logger.ts          # File-Logger für ~/.pi/agent/mempalace-lite.log
│   └── types.ts           # Shared Types
├── dist/                  # esbuild output (gitignored)
├── tests/
│   ├── resolver.test.mjs  # Python-Discovery-Tests (gemockt)
│   ├── cli.test.mjs       # CLI-Parser-Tests
│   └── integration.test.mjs
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── .gitignore
├── LICENSE
└── README.md
```

**Wichtig:** `package.json` zeigt mit `"main"` auf `dist/index.js`, **nicht** auf `src/index.ts`. Das vermeidet Laufzeit-TS-Kompilierung im Pi-Host.

---

## 3. Python-Resolver (`src/resolver.ts`)

Das Herzstück für Windows-Stabilität. Läuft genau einmal beim Extension-Load, cached das Ergebnis.

### Auflösungsreihenfolge

```
1. $MEMPALACE_PYTHON              (expliziter Override, falls gesetzt)
2. $MEMPALACE_VENV/Scripts/python.exe  (Windows-venv)
   bzw.  $MEMPALACE_VENV/bin/python    (Unix-venv)
3. ~/.mempalace/.venv/...         (Default-Venv-Pfad)
4. py -3                          (Python Launcher, nur Windows)
5. python3                        (Unix/macOS typisch)
6. python                         (Fallback)
7. mempalace.exe / mempalace      (falls als standalone CLI installiert)
```

### Validierung

Jeder Kandidat wird einmal mit folgendem Probe-Call getestet:

```python
python -c "import mempalace, json, sys; print(json.dumps({'version': mempalace.__version__, 'exe': sys.executable}))"
```

Exit-Code 0 und parsebares JSON → Kandidat ist valid. Ergebnis wird mit Timestamp und Hash des Python-Binaries gecached in `~/.pi/agent/mempalace-lite-resolver.json`. Cache wird invalidiert, wenn das Binary fehlt oder der Hash nicht mehr stimmt.

### Windows-Encoding-Fix

Der Resolver injiziert bei jedem Spawn automatisch:

```typescript
env: {
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
}
```

Das behebt den bekannten MemPalace-Crash bei Nicht-ASCII-Zeichen auf Windows, ohne dass der User manuell System-Env-Variablen setzen muss.

### Public API

```typescript
export interface ResolvedRuntime {
  kind: "python" | "cli";
  exe: string;              // z.B. "C:\Python312\python.exe" oder "mempalace.exe"
  args: string[];           // z.B. ["-m", "mempalace"] oder []
  version: string;          // MemPalace-Version
  cacheHit: boolean;
}

export async function resolveRuntime(
  options?: { forceRefresh?: boolean }
): Promise<ResolvedRuntime>;
```

---

## 4. CLI-Wrapper (`src/cli.ts`)

Eine einzige Funktion, die **jeden** mempalace-Aufruf abwickelt. Kein eigener Code pro Tool.

```typescript
import { execa } from "execa";
import { resolveRuntime } from "./resolver.js";

export interface CliResult<T = unknown> {
  ok: boolean;
  data?: T;
  stderr?: string;
  durationMs: number;
  command: string;
}

export async function runMempalace<T = unknown>(
  args: string[],
  options?: {
    cwd?: string;
    timeoutMs?: number;
    input?: string;
    json?: boolean;        // wenn true: --json anhängen, stdout parsen
    signal?: AbortSignal;  // ctx.signal aus Pi durchschleifen
  }
): Promise<CliResult<T>>;
```

**Kernmerkmale:**

- Timeout-Default **15 s**, konfigurierbar.
- `json: true` hängt `--json` an und parsed stdout als `JSON.parse` in ein Try-Catch. Bei Parse-Fehler wird `ok: false` zurückgegeben mit raw stdout in `stderr`.
- Bei `ctx.signal` wird der Prozess ordentlich terminiert (SIGTERM → SIGKILL nach 2 s).
- Jeder Aufruf wird via `logger.ts` in die Logdatei geschrieben mit Command, Dauer, Exit-Code.

---

## 5. Agent-Tools (`src/tools.ts`)

Fünf Tools, sauber auf die MemPalace-CLI gemappt. Keine dynamische Erweiterung, keine Reflection, keine MCP-Umweg.

| Tool-Name              | CLI-Aufruf                          | Zweck                                             |
|------------------------|-------------------------------------|---------------------------------------------------|
| `mempalace_search`     | `mempalace search "<query>" --json` | Semantische Suche im Palace                       |
| `mempalace_mine`       | `mempalace mine <path> --json`      | Inhalte in den Palace einspeisen                  |
| `mempalace_status`     | `mempalace status --json`           | Palace-Metadaten, Größe, letzte Operation         |
| `mempalace_init`       | `mempalace init <path>`             | Neuen Palace initialisieren                       |
| `mempalace_wake_up`    | `mempalace wake-up --json`          | Kontext für neue Session laden                    |

**Alle Tools haben einheitliche JSON-Schemas** mit optionalen `cwd`-, `path`- und `query`-Parametern. Return-Format:

```typescript
{
  success: boolean;
  result?: unknown;       // das geparste JSON aus der CLI
  message: string;        // menschenlesbar, für das TUI
  details?: {             // für State-Reconstruction bei Branching
    command: string;
    durationMs: number;
    source: "cli";
  };
}
```

**Graceful Degradation:** Wenn der Resolver beim Extension-Load fehlschlägt (kein Python, kein MemPalace), werden die Tools trotzdem registriert, geben aber einen festen "Setup incomplete, run /mempalace:doctor"-Payload zurück. Das hält Pi spawn-bar, auch wenn das Backend fehlt.

---

## 6. Slash-Commands (`src/commands.ts`)

Sechs Commands, zwei Kategorien:

- **Action-Commands** (`init`, `mine`, `search`, `status`, `wake-up`) injizieren eine Steering-Message an den Agenten via `pi.queuePrompt()` oder `before_agent_start`-Hook. Das Tool wird vom Agenten aufgerufen, Tool-Call und Tool-Result landen in der Conversation-History. Vorteil: Der Agent kennt das Ergebnis und kann darauf reagieren (z.B. nach `search` die Treffer interpretieren und weiterarbeiten).
- **Diagnose-Commands** (`doctor`, `help`) laufen **direkt**, ohne Agent-Beteiligung — reiner User-Output ins TUI.

### Steering-Message-Format

Die injizierte Message an den Agenten ist knapp und instruktiv, nicht höflich-unklar. Beispiel `/mempalace:search "auth token rotation"`:

```
[pi-mempalace] Use the mempalace_search tool to search the palace for:
query: "auth token rotation"

Show the top results to me, then summarize the most relevant ones.
```

Kein "bitte", kein "könntest du vielleicht" — klare Anweisung, klarer Tool-Name, klare Parameter.

### Per-Command-Verhalten

| Command                      | Kategorie   | Verhalten                                                                 |
|------------------------------|-------------|---------------------------------------------------------------------------|
| `/mempalace:help`            | Direkt      | Statischer Hilfetext aus Bundle, keine CLI-, keine Agent-Aktion.         |
| `/mempalace:doctor`          | Direkt      | Siehe Abschnitt 8. Eigenes Custom-Render-Panel, keine Agent-Beteiligung. |
| `/mempalace:init [path]`     | Agent       | Steering-Message: "Use mempalace_init with path=..." (Default cwd)       |
| `/mempalace:mine [path]`     | Agent       | Steering-Message: "Use mempalace_mine with path=..." (Default cwd)       |
| `/mempalace:search <query>`  | Agent       | Steering-Message: "Use mempalace_search with query=..."                  |
| `/mempalace:status`          | Agent       | Steering-Message: "Use mempalace_status to report palace state."         |
| `/mempalace:wake-up`         | Agent       | Steering-Message: "Use mempalace_wake_up to load session context."       |

### Warum das Pattern für Action-Commands richtig ist

Ohne Agent-Beteiligung wäre `/mempalace:search` nur ein User-Shortcut zum Terminal-Suchen. Mit Agent-Beteiligung ist es ein echter Workflow-Baustein: du tippst den Command, der Agent bekommt die Treffer, und du kannst im selben Turn schreiben "zeig mir die erste Drawer im Detail" oder "welche davon sind Auth-bezogen" — ohne die Ergebnisse manuell weiterzureichen.

### Escape-Hatch für reine User-Queries

Für Fälle, in denen du die CLI **ohne** Agent-Round-Trip ausführen willst (z.B. zum schnellen Debuggen), gibt es einen optionalen Raw-Modus über das `!`-Suffix:

```
/mempalace:search! "quick test"
```

Führt direkt aus und zeigt das JSON-Result im TUI, bypasst den Agenten komplett. Ist bewusst als Opt-in-Feature gebaut — Default bleibt der Agent-Pfad.

---

## 7. Hooks (`src/hooks.ts`)

Genau zwei Hooks, kein Mehr. Die Pi-Lifecycle-Events, die wir abonnieren:

### Hook 1: Auto-Save-Reminder (`user_message`)

- Zähler pro Session für **echte** User-Messages (keine Slash-Commands, keine Steering-Messages).
- Default-Threshold: **15** (konfigurierbar über `mempalace.yaml`).
- Bei Erreichen: eine einzige Nachricht in den Context injiziert (via `before_agent_start`), die dem Agenten signalisiert, dass ein Zwischenspeichern sinnvoll wäre. Keine Toast-Explosionen, keine Multi-Step-Protokolle.
- Zähler reset nach erfolgreichem `mempalace_mine`- oder `mempalace_diary_write`-Aufruf (sofern letzteres per CLI verfügbar ist).

### Hook 2: Pre-Compaction Ingest (`session_before_compact`)

- **Synchron, blocking** — wir lassen die Kompaktierung nicht laufen, bevor der Save durch ist.
- Target-Auflösung in Reihenfolge: `$MEMPAL_DIR` → Pi-Session-File-Directory → `cwd`.
- Timeout 30 s. Bei Timeout oder Fehler: Hook loggt ordentlich und lässt die Kompaktierung trotzdem laufen (weil blockieren noch schlimmer wäre als unvollständiger Save).
- Nach erfolgreicher Ausführung: Reset des Auto-Save-Zählers.

**Was wir _nicht_ hooken:**

- `agent_end` (Background-Ingest — zu viele Race-Conditions mit User-Flow)
- `tool_call` / `tool_result` (keinen Permission-Gate-Bedarf bei MemPalace)
- Custom-Toast-Lifecycle

---

## 8. Doctor (`src/doctor.ts`)

Fünf Checks, jeder mit klarem Grün/Gelb/Rot:

| # | Check                              | Grün                                  | Gelb                                  | Rot                                |
|---|------------------------------------|---------------------------------------|---------------------------------------|------------------------------------|
| 1 | Python-Runtime aufgelöst           | Ja, Version ≥ 3.9                     | Ja, aber < 3.9                        | Nein                               |
| 2 | `mempalace`-Paket importierbar     | Ja, Version bekannt                   | Ja, aber Version < Mindest            | Nein                               |
| 3 | `mempalace --version` antwortet    | < 2 s                                 | 2–10 s                                | Timeout / Error                    |
| 4 | `MEMPAL_DIR` existiert & schreibbar | Ja                                    | Existiert, nicht schreibbar           | Nicht gesetzt / nicht vorhanden    |
| 5 | Windows: `PYTHONUTF8=1` wirksam    | Ja (automatisch durch Resolver)       | Nicht Windows (skip)                  | Windows, aber Probe-Call fehlschlägt |

Jeder Check hat einen **Fix-Vorschlag** als Text, nicht nur "rot". Beispiel für Check 2 auf Windows:

```
✗ mempalace package not importable with resolved Python.

Fix:
  C:\Path\To\Python\python.exe -m pip install --upgrade mempalace

If you use multiple Python installations, set MEMPALACE_PYTHON:
  $env:MEMPALACE_PYTHON = "C:\Path\To\Python\python.exe"
```

Output als Pi-Custom-Renderer, nicht als Markdown-Blob. Copy-Paste-fähige Fix-Zeilen.

---

## 9. Config (`src/config.ts`)

Zwei Quellen, in dieser Priorität: **Env-Variablen > `mempalace.yaml`**.

### `mempalace.yaml` (optional, im Projekt-Root)

```yaml
# pi-mempalace-extension configuration
autosave:
  threshold: 15           # User-Messages bis Auto-Save-Reminder
  enabled: true

compaction:
  pre_ingest: true        # synchroner Ingest vor Compaction
  timeout_ms: 30000

palace:
  dir: null               # null = aus $MEMPAL_DIR / Session-Dir / cwd ableiten

runtime:
  python_override: null   # null = auto-resolve
  encoding: "utf-8"       # wird als PYTHONIOENCODING gesetzt

logging:
  level: "info"           # debug, info, warn, error
  file: "~/.pi/agent/mempalace-lite.log"
```

### Env-Variablen (override)

- `MEMPALACE_PYTHON` — voller Pfad zum Python-Binary
- `MEMPALACE_VENV` — Venv-Directory (Resolver probiert `Scripts/python.exe` bzw. `bin/python`)
- `MEMPAL_DIR` — Palace-Directory (von MemPalace selbst gelesen)
- `MEMPALACE_LOG_LEVEL` — override Log-Level
- `MEMPALACE_AUTOSAVE_DISABLE=1` — Auto-Save-Hook komplett deaktivieren

---

## 10. Logging (`src/logger.ts`)

Minimalistischer File-Logger, nicht Winston, nicht Pino — kein Ballast:

- Append-only JSONL unter `~/.pi/agent/mempalace-lite.log`
- Rotation bei > 5 MB (behält die letzten 3 Files)
- Jeder Log-Eintrag: `{ ts, level, source, message, ctx? }`
- Quellen: `resolver`, `cli`, `tool:<name>`, `command:<name>`, `hook:<name>`, `doctor`

Für Post-mortem-Analyse ausreichend, für Observability nicht overkill.

---

## 11. Packaging & Build

### `package.json` (Kern)

```json
{
  "name": "pi-mempalace-extension",
  "version": "0.1.0",
  "description": "Lean MemPalace integration for the Pi coding agent",
  "main": "dist/index.js",
  "type": "module",
  "pi": {
    "extension": "dist/index.js"
  },
  "scripts": {
    "build": "node esbuild.config.mjs",
    "test": "node --test tests/*.test.mjs",
    "check": "tsc --noEmit && biome check src"
  },
  "dependencies": {
    "execa": "^9.0.0",
    "yaml": "^2.5.0"
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": ">=0.x"
  },
  "files": ["dist/", "README.md", "LICENSE"]
}
```

### Build (`esbuild.config.mjs`)

```javascript
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/index.js",
  external: ["@mariozechner/pi-coding-agent"],
  sourcemap: true,
  minify: false,  // lieber lesbare Stack-Traces
});
```

### Install-Pfade

- **Global:** `pi install npm:pi-mempalace-extension` oder lokaler Pfad nach `~/.pi/agent/extensions/`
- **Projekt-lokal:** `.pi/extensions/pi-mempalace-extension/`

---

## 12. Tests

Drei Testebenen, ohne Test-Religion:

### `tests/resolver.test.mjs`
- Mock PATH und Filesystem mit `mock-fs`
- Fälle: Env-Override gewinnt, Venv-Pfade werden korrekt abgeleitet, `py -3` nur auf Windows probiert, Cache-Invalidierung bei Hash-Mismatch.

### `tests/cli.test.mjs`
- Mocked `execa` via Dependency-Injection-Trick
- Fälle: Timeout → `ok: false`, JSON-Parse-Fehler → `ok: false` mit raw stdout, `--json` wird nur bei `json: true` angehängt, Signal-Abort terminiert Prozess.

### `tests/integration.test.mjs`
- **Skipped by default.** Laufen nur, wenn `MEMPALACE_INTEGRATION_TEST=1` gesetzt ist.
- Echter Round-Trip: `init` in tmp-Dir, `mine` eines Test-Files, `search` auf bekannten Inhalt, `status` liefert Metadaten.

Keine Parity-Tests gegen ein Upstream-Plugin. Wir bauen nicht Parität, wir bauen Funktionalität.

---

## 13. Entry Point (`src/index.ts`) — Skelett

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolveRuntime } from "./resolver.js";
import { registerTools } from "./tools.js";
import { registerCommands } from "./commands.js";
import { registerHooks } from "./hooks.js";
import { loadConfig } from "./config.js";
import { initLogger } from "./logger.js";

export default async function (pi: ExtensionAPI): Promise<void> {
  const config = await loadConfig(pi.projectRoot);
  const logger = initLogger(config.logging);

  logger.info("extension-load", { version: "0.1.0" });

  // Resolve Runtime lazy beim ersten Tool-Call, damit Pi immer startet
  const runtimePromise = resolveRuntime().catch((err) => {
    logger.warn("resolver-failed", { error: err.message });
    return null;
  });

  registerTools(pi, { runtimePromise, config, logger });
  registerCommands(pi, { runtimePromise, config, logger });
  registerHooks(pi, { runtimePromise, config, logger });

  logger.info("extension-ready");
}
```

Lazy-Runtime-Resolution ist wichtig: auch wenn MemPalace nicht installiert ist, startet Pi. Der Doctor ist dann der primäre Weg raus aus dem Setup-Loch.

---

## 14. MVP-Roadmap (Phasen)

### Phase 1 — Skelett (Tag 1–2, ~200 LOC)
- [ ] Projekt-Setup, esbuild, tsconfig
- [ ] `resolver.ts` mit den 7 Auflösungskandidaten + Cache
- [ ] `cli.ts` mit `runMempalace()`
- [ ] `logger.ts`
- [ ] `index.ts` Entry mit Lazy-Resolve
- [ ] `/mempalace:doctor` als einziger Command (damit man überhaupt debuggen kann)

### Phase 2 — Tools & Commands (Tag 3–4, ~250 LOC)
- [ ] Die fünf Tools registriert
- [ ] Die sechs Slash-Commands (ohne Hooks)
- [ ] `config.ts` mit YAML + Env-Override

### Phase 3 — Hooks (Tag 5, ~100 LOC)
- [ ] Auto-Save-Reminder
- [ ] Pre-Compaction-Ingest

### Phase 4 — Tests & Polish (Tag 6–7, ~50 LOC Test-Code + Docs)
- [ ] Resolver-Unit-Tests
- [ ] CLI-Unit-Tests
- [ ] Integration-Test unter Real-Bedingungen auf Windows + einem Linux-Setup
- [ ] README mit Installations-Anleitung
- [ ] Erstes `0.1.0`-Release auf npm oder direkt als Git-Install-Source

**Gesamt-Zielumfang:** ~600 LOC Produktivcode, ~150 LOC Tests. Fertig in einer ruhigen Woche.

---

## 15. Abgleich mit Original

| Feature                          | `juhas96/mempalace-pi` | `pi-mempalace-extension` |
|----------------------------------|------------------------|--------------------------|
| Slash-Commands                   | Prompt-Indirektion für alle | Agent-Prompt für Actions, direkt für Diagnose |
| Transport-Layer                  | MCP + CLI + Python-Import | Nur CLI               |
| Python-Resolver                  | python3/python/mempalace | + py -3, Venvs, Override |
| Windows-Encoding-Fix             | Nein                   | Auto via Resolver         |
| Packaging                        | `src/*.ts` direkt      | `dist/index.js` gebundled |
| Hook-Anzahl                      | 4+                     | 2                         |
| LOC-Zielgröße                    | ~1.600                 | ~600                      |
| Claude-Plugin-Parity             | Designziel             | Nicht-Ziel                |
| Dynamic Tool-Discovery           | Ja                     | Nein                      |
| Circuit Breaker                  | Ja (MCP)               | Nein (nicht nötig)        |
| Doctor-Command                   | Ja                     | Ja, fokussierter          |

---

## 16. Risiken & offene Fragen

1. **Upstream-CLI-Stabilität.** Wenn MemPalace eine CLI-Option umbenennt, brechen wir. Gegen: Version-Pinning in `package.json` mit klarer Mindest-MemPalace-Version, Doctor prüft Version.

2. **`mempalace_diary_write` via CLI verfügbar?** Muss beim Implementieren geprüft werden. Falls nicht: Entweder Feature weglassen oder einen sehr kleinen Python-Oneliner via `python -c` bauen — aber nur über öffentliche `mempalace.diary`-API, **nicht** via `mcp_server`-Internals.

3. **JSONL-Session-File-Auflösung auf Windows.** Pi speichert Sessions unter `%USERPROFILE%\.pi\...`. Beim Pre-Compaction-Hook müssen wir den Session-File-Path sauber aus der ExtensionAPI beziehen, nicht raten.

4. **Concurrent CLI-Calls.** Wenn Auto-Save-Hook feuert, während der Agent gerade `mempalace_search` macht — MemPalace sollte das vertragen (SQLite-Level-Locking), aber wir sollten es einmal messen.

5. **Palace-Lock-Files.** Falls MemPalace Lock-Files auf macOS/Linux anders als Windows handhabt, kann der Doctor das später prüfen — für MVP kein Blocker.

---

## 17. Was als Nächstes

Wenn du auf Basis dieses Konzepts starten willst, sind das die drei konkreten nächsten Schritte:

1. **Repo-Skelett anlegen** (Git, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`) — das kannst du direkt in deinem Dev-Stack-Workflow machen, wahrscheinlich als neues Azure-DevOps-Repo.
2. **Resolver + Doctor zuerst bauen**, bevor irgendein Tool steht. Ohne sauberen Resolver ist alles andere Blindflug.
3. **Gegen echten MemPalace-Install testen**, nicht gegen Mocks. Ein frisches Windows-Venv, `pip install mempalace`, `MEMPAL_DIR` gesetzt, Pi gestartet — dann Extension-Load, Doctor, Init, Mine, Search. Wenn dieser Roundtrip läuft, hast du das MVP.

---

*Konzept v0.1 — Änderungen willkommen, bevor eine Zeile Code fällt.*
