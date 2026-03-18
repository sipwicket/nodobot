export type LogLevel = "error" | "warn" | "info" | "debug";

type LoggerOpts = {
  level: LogLevel;
  includeTenantId: boolean;
};

// Simple in-memory cache of tenant names by id so logs can include a
// human-friendly name even when only tenantId is provided in later calls.
const TENANT_NAME_CACHE = new Map<string, string>();

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
    const ts = new Date().toISOString();
    const metaPayload: Record<string, unknown> = meta ? { ...meta } : {};
    // Tenant details are injected by callers via meta (tenantId, tenantName).
    const rawTenantId = metaPayload.tenantId;
    const tenantId = typeof rawTenantId === "string" || typeof rawTenantId === "number"
      ? String(rawTenantId)
      : undefined;
    const explicitTenantName = typeof metaPayload.tenantName === "string" ? metaPayload.tenantName : undefined;

    // Update cache whenever an explicit name is provided.
    if (tenantId && explicitTenantName) {
      TENANT_NAME_CACHE.set(tenantId, explicitTenantName);
    }

    const cachedTenantName = tenantId ? TENANT_NAME_CACHE.get(tenantId) : undefined;
    const tenantName = explicitTenantName ?? cachedTenantName;
    if (!this.#includeTenantId) {
      if ("tenantId" in metaPayload) delete metaPayload.tenantId;
      if ("tenantName" in metaPayload) delete metaPayload.tenantName;
    }

    const metaStr =
      Object.keys(metaPayload).length > 0 ? ` ${JSON.stringify(metaPayload)}` : "";

    const tenantPrefix =
      this.#includeTenantId && tenantId != null
        ? `[tenant:${String(tenantId)}${tenantName ? ` (${tenantName})` : ""}] `
        : "";

    const line = `[${ts}] [${level.toUpperCase()}] ${tenantPrefix}${msg}${metaStr}`;

    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

