import path from "node:path";
import {
  appendFile,
  mkdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import type {
  LogContext,
  LogEntry,
  LogLevel,
  LoggingConfig,
} from "./types.js";

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ROTATED_FILES = 3;

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(source: string, message: string, ctx?: LogContext): void;
  info(source: string, message: string, ctx?: LogContext): void;
  warn(source: string, message: string, ctx?: LogContext): void;
  error(source: string, message: string, ctx?: LogContext): void;
  flush(): Promise<void>;
}

export function initLogger(config: LoggingConfig): Logger {
  const logFilePath = path.resolve(config.file);
  let writeQueue = Promise.resolve();

  function log(level: LogLevel, source: string, message: string, ctx?: LogContext) {
    if (!shouldWrite(config.level, level)) {
      return;
    }

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      source,
      message,
      ...(ctx === undefined ? {} : { ctx }),
    };

    const line = `${JSON.stringify(entry)}\n`;
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(async () => writeLogLine(logFilePath, line));
  }

  return {
    debug(source, message, ctx) {
      log("debug", source, message, ctx);
    },
    info(source, message, ctx) {
      log("info", source, message, ctx);
    },
    warn(source, message, ctx) {
      log("warn", source, message, ctx);
    },
    error(source, message, ctx) {
      log("error", source, message, ctx);
    },
    async flush() {
      await writeQueue;
    },
  };
}

function shouldWrite(configuredLevel: LogLevel, entryLevel: LogLevel): boolean {
  return LOG_LEVEL_ORDER[entryLevel] >= LOG_LEVEL_ORDER[configuredLevel];
}

async function writeLogLine(logFilePath: string, line: string): Promise<void> {
  try {
    await mkdir(path.dirname(logFilePath), { recursive: true });
    await rotateIfNeeded(logFilePath, Buffer.byteLength(line, "utf8"));
    await appendFile(logFilePath, line, "utf8");
  } catch {
    // Logging must never crash the extension.
  }
}

async function rotateIfNeeded(
  logFilePath: string,
  incomingBytes: number,
): Promise<void> {
  const currentSize = await getFileSize(logFilePath);
  if (currentSize + incomingBytes <= MAX_LOG_SIZE_BYTES) {
    return;
  }

  await rm(getRotatedLogPath(logFilePath, MAX_ROTATED_FILES), {
    force: true,
  });

  for (let index = MAX_ROTATED_FILES - 1; index >= 1; index -= 1) {
    const currentPath = getRotatedLogPath(logFilePath, index);
    const nextPath = getRotatedLogPath(logFilePath, index + 1);

    if (await fileExists(currentPath)) {
      await rename(currentPath, nextPath);
    }
  }

  if (await fileExists(logFilePath)) {
    await rename(logFilePath, getRotatedLogPath(logFilePath, 1));
  }
}

function getRotatedLogPath(logFilePath: string, index: number): string {
  return `${logFilePath}.${index}`;
}

async function getFileSize(targetPath: string): Promise<number> {
  try {
    const fileStat = await stat(targetPath);
    return fileStat.size;
  } catch {
    return 0;
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
