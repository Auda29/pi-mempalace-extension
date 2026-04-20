export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

export interface LogEntry {
  ts: string;
  level: LogLevel;
  source: string;
  message: string;
  ctx?: LogContext;
}

export interface AutosaveConfig {
  enabled: boolean;
  threshold: number;
}

export interface CompactionConfig {
  preIngest: boolean;
  timeoutMs: number;
}

export interface PalaceConfig {
  dir: string | null;
}

export interface RuntimeConfig {
  pythonOverride: string | null;
  encoding: string;
}

export interface LoggingConfig {
  level: LogLevel;
  file: string;
}

export type RuntimeKind = "python" | "cli";

export interface ResolvedRuntime {
  kind: RuntimeKind;
  exe: string;
  args: string[];
  version: string;
  cacheHit: boolean;
}

export interface CliResult<T = unknown> {
  ok: boolean;
  data?: T;
  stderr?: string;
  durationMs: number;
  command: string;
}

export interface RuntimePromiseContext {
  runtimePromise: Promise<ResolvedRuntime | null>;
}

export interface MempalaceConfig {
  autosave: AutosaveConfig;
  compaction: CompactionConfig;
  palace: PalaceConfig;
  runtime: RuntimeConfig;
  logging: LoggingConfig;
}

export interface LoadConfigOptions {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
}

export interface ConfigSourceInfo {
  path: string | null;
  exists: boolean;
}

export interface LoadedConfig {
  config: MempalaceConfig;
  source: ConfigSourceInfo;
}

export interface RawMempalaceConfig {
  autosave?: {
    enabled?: boolean;
    threshold?: number;
  };
  compaction?: {
    pre_ingest?: boolean;
    timeout_ms?: number;
  };
  palace?: {
    dir?: string | null;
  };
  runtime?: {
    python_override?: string | null;
    encoding?: string;
  };
  logging?: {
    level?: LogLevel;
    file?: string;
  };
}
