export type TenantSettingsV1 = {
  schemaVersion: 1;
  featureFlags: {
    duplicateLinks: boolean;
    twitterFix: boolean;
    tiktokFix: boolean;
    instagramDownload: boolean;
    instagramFallbackFix: boolean;
    duplicateImages: boolean;
    webmConversion: boolean;
    directReply: boolean;
    randomImage: boolean;
    helpCommand: boolean;
  };
  duplicateLinks: {
    cacheSize: number;
    responseTemplate: string;
  };
  duplicateImages: {
    cacheSize: number;
    hashBits: 8 | 12 | 16;
    matchMode: "exact";
    warningImageUrl: string;
    responseTemplate: string;
  };
  twitterFix: {
    fixerDomain: "fxtwitter.com";
    deleteOriginalMessage: boolean;
    postTemplate: string;
  };
  tiktokFix: {
    fixerDomain: "fxtiktok.com";
    deleteOriginalMessage: boolean;
    postTemplate: string;
  };
  instagram: {
    preferNativeDownload: boolean;
    fallbackFixDomain: "kkinstagram.com";
    minRequestIntervalMs: number;
    retryBackoffMs: [number, number, number, number];
    progressUpdates: boolean;
    maxMediaGroupSize: number;
    deleteOriginalMessage: boolean;
    postTemplate: string;
  };
  webmConversion: {
    mode: "standard" | "ultraFast";
    deleteOriginalMessage: boolean;
    maxInputSizeMb: number;
    ffmpegPreset: "ultrafast";
    crf: number;
    audioBitrateKbps: number;
    postTemplate: string;
  };
  commands: {
    helpCommand: string;
    setThresholdCommand: string;
    setResolutionCommand: string;
    increaseSensitivityCommand: string;
  };
  directReply: {
    mode: "randomPool" | "singleFallback";
    randomReplies: string[];
    fallbackReply: string;
  };
  randomImage: {
    endpoints: string[];
    sendingMessage: string;
  };
  subscription: {
    inactiveMessage: string;
    recheckTtlSeconds: number;
  };
  observability: {
    logLevel: "error" | "warn" | "info" | "debug";
    includeTenantIdInLogs: boolean;
  };
};

export function defaultTenantSettingsV1(): TenantSettingsV1 {
  return {
    schemaVersion: 1,
    featureFlags: {
      duplicateLinks: true,
      twitterFix: true,
      tiktokFix: true,
      instagramDownload: true,
      instagramFallbackFix: true,
      duplicateImages: true,
      webmConversion: true,
      directReply: false,
      randomImage: false,
      helpCommand: true,
    },
    duplicateLinks: {
      cacheSize: 50,
      responseTemplate: "Found an identical link! Posted by {author}, {ago}.",
    },
    duplicateImages: {
      cacheSize: 50,
      hashBits: 8,
      matchMode: "exact",
      warningImageUrl: "https://i.imgur.com/6o7QpYd.jpeg",
      responseTemplate: "Found a similar image! Posted by {author}, {ago}.",
    },
    twitterFix: {
      fixerDomain: "fxtwitter.com",
      deleteOriginalMessage: true,
      postTemplate: "<b>{author}</b> posted:\n{url}",
    },
    tiktokFix: {
      fixerDomain: "fxtiktok.com",
      deleteOriginalMessage: true,
      postTemplate: "<b>{author}</b> posted:\n{url}",
    },
    instagram: {
      preferNativeDownload: true,
      fallbackFixDomain: "kkinstagram.com",
      minRequestIntervalMs: 2000,
      retryBackoffMs: [1000, 2000, 5000, 15000],
      progressUpdates: true,
      maxMediaGroupSize: 10,
      deleteOriginalMessage: true,
      postTemplate: "<b>{author}</b> posted: Instagram media ({count} items)",
    },
    webmConversion: {
      mode: "standard",
      deleteOriginalMessage: true,
      maxInputSizeMb: 100,
      ffmpegPreset: "ultrafast",
      crf: 28,
      audioBitrateKbps: 128,
      postTemplate: "<b>{author}</b> shared a video (converted from webm)",
    },
    commands: {
      helpCommand: "help",
      setThresholdCommand: "setthreshold",
      setResolutionCommand: "setresolution",
      increaseSensitivityCommand: "increasesensitivity",
    },
    directReply: {
      mode: "randomPool",
      randomReplies: [],
      fallbackReply: "Functionality not implemented, {username}.",
    },
    randomImage: {
      endpoints: [],
      sendingMessage: "Sending random image...",
    },
    subscription: {
      inactiveMessage:
        "This group needs an active subscription to use this bot.",
      recheckTtlSeconds: 60,
    },
    observability: {
      logLevel: "info",
      includeTenantIdInLogs: true,
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireLiteral<T extends string>(
  v: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof v !== "string") {
    throw new Error(`Invalid ${path}: expected string`);
  }
  if (!allowed.includes(v as T)) {
    throw new Error(`Invalid ${path}: expected one of ${allowed.join(", ")}`);
  }
  return v as T;
}

function requireBoolean(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") {
    throw new Error(`Invalid ${path}: expected boolean`);
  }
  return v;
}

function requireNumber(v: unknown, path: string): number {
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(`Invalid ${path}: expected number`);
  }
  return v;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function mergeTenantSettingsV1(
  base: TenantSettingsV1,
  overrides: Partial<TenantSettingsV1> | null,
): TenantSettingsV1 {
  if (!overrides) return base;
  // Shallow-then-deep merge per top-level key; explicit, predictable.
  const merged: TenantSettingsV1 = structuredClone(base);
  const mergedRecord = merged as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(overrides)) {
    if (!(k in mergedRecord)) continue;
    const current = mergedRecord[k];
    mergedRecord[k] = isObject(v) && isObject(current)
      ? { ...current, ...v }
      : v;
  }
  return merged;
}

export function validateTenantSettingsV1(input: unknown): TenantSettingsV1 {
  if (!isObject(input)) throw new Error("Invalid settings: expected object");
  if (input.schemaVersion !== 1) {
    throw new Error("Invalid settings.schemaVersion");
  }

  const base = defaultTenantSettingsV1();
  const overrides = input as Partial<TenantSettingsV1>;
  const merged = mergeTenantSettingsV1(base, overrides);

  // featureFlags
  if (!isObject(merged.featureFlags)) throw new Error("Invalid featureFlags");
  for (
    const key of Object.keys(
      base.featureFlags,
    ) as (keyof TenantSettingsV1["featureFlags"])[]
  ) {
    merged.featureFlags[key] = requireBoolean(
      (merged.featureFlags as any)[key],
      `featureFlags.${key}`,
    );
  }

  merged.duplicateLinks.cacheSize = clamp(
    requireNumber(merged.duplicateLinks.cacheSize, "duplicateLinks.cacheSize"),
    10,
    200,
  );

  merged.duplicateImages.cacheSize = clamp(
    requireNumber(
      merged.duplicateImages.cacheSize,
      "duplicateImages.cacheSize",
    ),
    10,
    200,
  );
  // hashBits is a numeric option, validate explicitly instead of using requireLiteral (which expects strings)
  const hashBitsNumber = requireNumber(
    merged.duplicateImages.hashBits,
    "duplicateImages.hashBits",
  );
  if (![8, 12, 16].includes(hashBitsNumber)) {
    throw new Error(
      "Invalid duplicateImages.hashBits: expected one of 8, 12, 16",
    );
  }
  merged.duplicateImages.hashBits =
    hashBitsNumber as TenantSettingsV1["duplicateImages"]["hashBits"];
  merged.duplicateImages.matchMode = requireLiteral(
    merged.duplicateImages.matchMode,
    ["exact"] as const,
    "duplicateImages.matchMode",
  );

  merged.twitterFix.fixerDomain = "fxtwitter.com";
  merged.tiktokFix.fixerDomain = "fxtiktok.com";
  merged.instagram.fallbackFixDomain = "kkinstagram.com";
  merged.webmConversion.ffmpegPreset = "ultrafast";

  merged.instagram.minRequestIntervalMs = clamp(
    requireNumber(
      merged.instagram.minRequestIntervalMs,
      "instagram.minRequestIntervalMs",
    ),
    500,
    10_000,
  );
  if (
    !Array.isArray(merged.instagram.retryBackoffMs) ||
    merged.instagram.retryBackoffMs.length !== 4 ||
    merged.instagram.retryBackoffMs.some((n) => typeof n !== "number")
  ) {
    throw new Error("Invalid instagram.retryBackoffMs");
  }
  merged.instagram.maxMediaGroupSize = clamp(
    requireNumber(
      merged.instagram.maxMediaGroupSize,
      "instagram.maxMediaGroupSize",
    ),
    1,
    10,
  );

  merged.webmConversion.mode = requireLiteral(
    merged.webmConversion.mode,
    ["standard", "ultraFast"] as const,
    "webmConversion.mode",
  );
  merged.webmConversion.maxInputSizeMb = clamp(
    requireNumber(
      merged.webmConversion.maxInputSizeMb,
      "webmConversion.maxInputSizeMb",
    ),
    5,
    500,
  );
  merged.webmConversion.crf = clamp(
    requireNumber(merged.webmConversion.crf, "webmConversion.crf"),
    18,
    35,
  );
  merged.webmConversion.audioBitrateKbps = clamp(
    requireNumber(
      merged.webmConversion.audioBitrateKbps,
      "webmConversion.audioBitrateKbps",
    ),
    64,
    320,
  );

  merged.subscription.recheckTtlSeconds = clamp(
    requireNumber(
      merged.subscription.recheckTtlSeconds,
      "subscription.recheckTtlSeconds",
    ),
    10,
    3600,
  );

  merged.observability.logLevel = requireLiteral(
    merged.observability.logLevel,
    ["error", "warn", "info", "debug"] as const,
    "observability.logLevel",
  );
  merged.observability.includeTenantIdInLogs = requireBoolean(
    merged.observability.includeTenantIdInLogs,
    "observability.includeTenantIdInLogs",
  );

  return merged;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replaceAll(
    /\{([a-zA-Z0-9_]+)\}/g,
    (_, k: string) => vars[k] ?? `{${k}}`,
  );
}
