import type { ProgressReporter } from "@core/contracts/mediaPorts.ts";
import type { InstagramApiResult } from "@core/features/instagram/mediaExtract.ts";

type InstagramClientOpts = {
  cookies?: string;
  minRequestIntervalMs: number;
  retryBackoffMs: [number, number, number, number];
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class InstagramClient {
  #cookies?: string;
  #minRequestIntervalMs: number;
  #retryBackoffMs: [number, number, number, number];
  #lastRequestAtMs = 0;

  constructor(opts: InstagramClientOpts) {
    this.#cookies = opts.cookies;
    this.#minRequestIntervalMs = opts.minRequestIntervalMs;
    this.#retryBackoffMs = opts.retryBackoffMs;
  }

  async getBlobMedia(shortcode: string, reporter?: ProgressReporter): Promise<InstagramApiResult> {
    const queryHash = "2c4c2e343a8f64c625ba02b2aa12c7f8";
    const variables = encodeURIComponent(JSON.stringify({ shortcode }));
    const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${variables}`;

    const obj = await this.#fetchJsonWithRetries(url, reporter);
    if (obj?.status === "fail") {
      // Fallback to query_id
      const data = await this.getBlobMediaWithQueryId(shortcode, reporter);
      const mediaData = data?.xdt_api__v1__media__shortcode__web_info?.items?.[0] ?? data;
      return { type: "query_id", data: mediaData };
    }

    return { type: "query_hash", data: obj.data };
  }

  async getBlobMediaWithQueryId(shortcode: string, reporter?: ProgressReporter): Promise<any> {
    const queryId = "9496392173716084";
    const variables = encodeURIComponent(
      JSON.stringify({
        shortcode,
        __relay_internal__pv__PolarisFeedShareMenurelayprovider: true,
        __relay_internal__pv__PolarisIsLoggedInrelayprovider: true,
      }),
    );
    const url = `https://www.instagram.com/graphql/query/?query_id=${queryId}&variables=${variables}`;
    const obj = await this.#fetchJsonWithRetries(url, reporter);
    if (obj?.status === "fail") {
      const msg = obj?.message ?? "Unknown error";
      throw new Error(`instagram query_id failed: ${msg}`);
    }
    return obj.data;
  }

  async #fetchJsonWithRetries(url: string, reporter?: ProgressReporter): Promise<any> {
    const delays = this.#retryBackoffMs;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        await this.#respectMinDelay();
        const headers: Record<string, string> = {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 10; Pixel 7 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117 Mobile Safari/537.36 Instagram 307.0.0.34.111",
        };
        if (this.#cookies) headers["Cookie"] = this.#cookies;

        const res = await fetch(url, { headers });
        const text = await res.text();
        const json = JSON.parse(text);

        if (json?.status === "fail") {
          const msg = String(json?.message ?? "").toLowerCase();
          const isRateLimit = msg.includes("wait") || msg.includes("rate") || msg.includes("try again");
          if (isRateLimit) {
            if (attempt < delays.length) {
              const d = delays[attempt];
              if (d === 15000 && reporter) await reporter(`Rate limited. Waiting ${d / 1000} seconds before retry...`);
              await sleep(d);
              continue;
            }
            throw new Error(`Instagram rate limit: ${json?.message ?? "Please wait and try again"}`);
          }
        }

        return json;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        const msg = lastErr.message.toLowerCase();
        const isRateLimit = msg.includes("rate") || msg.includes("wait");
        if (isRateLimit && attempt < delays.length) {
          const d = delays[attempt];
          if (d === 15000 && reporter) await reporter(`Rate limited. Waiting ${d / 1000} seconds before retry...`);
          await sleep(d);
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr ?? new Error("instagram fetch failed");
  }

  async #respectMinDelay() {
    const now = Date.now();
    const elapsed = now - this.#lastRequestAtMs;
    if (elapsed < this.#minRequestIntervalMs) {
      await sleep(this.#minRequestIntervalMs - elapsed);
    }
    this.#lastRequestAtMs = Date.now();
  }
}

