export type LogLevel = "error" | "warn" | "info" | "debug";

type LoggerOpts = {
  level: LogLevel;
  includeTenantId: boolean;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export class Logger {
  #level: LogLevel;
  #includeTenantId: boolean;

  constructor(opts: LoggerOpts) {
    this.#level = opts.level;
    this.#includeTenantId = opts.includeTenantId;
  }

  error(msg: string, meta?: Record<string, unknown>) {
    this.#log("error", msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>) {
    this.#log("warn", msg, meta);
  }
  info(msg: string, meta?: Record<string, unknown>) {
    this.#log("info", msg, meta);
  }
  debug(msg: string, meta?: Record<string, unknown>) {
    this.#log("debug", msg, meta);
  }

  #log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] > LEVEL_ORDER[this.#level]) return;
    const payload: Record<string, unknown> = { level, msg, ts: new Date().toISOString() };
    if (meta) Object.assign(payload, meta);
    // Tenant id inclusion is handled by callers by injecting in meta.
    if (!this.#includeTenantId && "tenantId" in payload) delete payload.tenantId;

    const line = JSON.stringify(payload);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

