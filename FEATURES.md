# Sip-chan (nodobot) — Feature Documentation

## Overview

Sip-chan is a Telegram group chat bot built with **TypeScript** and the **Telegraf** framework. Its primary purpose is to enhance group chat experiences by detecting duplicate content, auto-fixing social media embeds, downloading Instagram media directly into chat, and converting unsupported video formats on the fly.

---

## Table of Contents

1. [Duplicate Link Detection](#1-duplicate-link-detection)
2. [Platform-Aware Link Normalization](#2-platform-aware-link-normalization)
3. [Automatic Twitter/X Embed Fixing](#3-automatic-twitterx-embed-fixing)
4. [Automatic TikTok Embed Fixing](#4-automatic-tiktok-embed-fixing)
5. [Instagram Media Downloading](#5-instagram-media-downloading)
6. [Instagram URL Embed Fixing (Fallback)](#6-instagram-url-embed-fixing-fallback)
7. [Duplicate Image Detection](#7-duplicate-image-detection)
8. [WebM to MP4 Conversion](#8-webm-to-mp4-conversion)
9. [Bot Commands](#9-bot-commands)
10. [Direct Reply Handling](#10-direct-reply-handling)
11. [Random Image Fetching](#11-random-image-fetching)
12. [Configuration System](#12-configuration-system)
13. [Logging](#13-logging)
14. [Error Handling & Graceful Shutdown](#14-error-handling--graceful-shutdown)
15. [Developer Tooling](#15-developer-tooling)
16. [Architecture & Project Structure](#16-architecture--project-structure)

---

## 1. Duplicate Link Detection

**Files:** `src/handlers/entityHandler.ts`, `src/utils/linkCache.ts`

When a user posts a URL in the group chat, the bot checks it against an in-memory cache of recently posted links. If a match is found, the bot replies to the message indicating who originally posted the link and how many minutes ago.

### How It Works

- Intercepts all `text` messages and inspects Telegram message entities of type `url`.
- Extracts a **normalized identifier** from the URL (platform-specific ID or raw URL — see section 2).
- Compares the identifier against the **link cache** (FIFO queue, max 50 entries).
- **On cache hit:** Replies with the original author's name and a relative timestamp (e.g., `"Found an identical link! Posted by Pedro, 12.5 minutes ago."`).
- **On cache miss:** Adds the link to the cache with the poster's name and message timestamp.

### Link Cache Details

- In-memory array of `LinkCacheItem` objects (`{ url, metadata: { date, author } }`).
- Maximum size: **50 entries** (oldest entry is evicted on overflow via `shift()`).
- No persistence — cache resets when the bot restarts.

---

## 2. Platform-Aware Link Normalization

**Files:** `src/utils/getYoutubeId.ts`, `src/utils/getTwitterId.ts`, `src/utils/getTiktokId.ts`, `src/utils/getInstagramId.ts`

To avoid false negatives in duplicate detection (e.g., the same video shared via different URL formats), the bot normalizes URLs from supported platforms into canonical identifiers before caching.

### Supported Platforms

| Platform   | Identifier Format     | Example Cache Key            | URL Patterns Recognized                                                                 |
|------------|-----------------------|------------------------------|------------------------------------------------------------------------------------------|
| YouTube    | Video ID              | `YOUTUBE-dQw4w9WgXcQ`       | `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`, `youtube.com/shorts/`        |
| Twitter/X  | Tweet status ID       | `TWITTER-1234567890`         | `x.com`, `twitter.com`, `fxtwitter.com`, `vxtwitter.com`                                |
| TikTok     | Video ID              | `TIKTOK-7123456789012345678` | `tiktok.com/@user/video/ID`, `fxtiktok.com/@user/video/ID`                              |
| Instagram  | URL pathname          | `INSTAGRAM-/p/ABC123/`      | `instagram.com/p/`, `instagram.com/reel/`, `instagram.com/reels/`, `kkinstagram.com`    |

- Each platform extractor uses regex to parse the unique content ID from any URL variant.
- Non-recognized URLs are cached as-is (raw URL string).

---

## 3. Automatic Twitter/X Embed Fixing

**Files:** `src/utils/getTwitterId.ts`, `src/handlers/entityHandler.ts`

When a user posts a link from `x.com` or `twitter.com`, the bot automatically replaces it with an embed-friendly version using **fxtwitter.com** so that Telegram renders a proper media preview.

### Behavior

1. Detects URLs from `x.com` or `twitter.com` that are **not** already using a fixer domain.
2. Extracts the tweet author username and status ID via regex.
3. Constructs a fixed URL: `https://fxtwitter.com/{username}/status/{id}`.
4. Sends a new message in the format: `**{Author}** posted:\n{fixed URL}` (with HTML formatting).
5. **Deletes the original message** to avoid duplicate embeds.

### Recognized Fixer Domains (skip processing)

- `fxtwitter.com`
- `vxtwitter.com`

---

## 4. Automatic TikTok Embed Fixing

**Files:** `src/utils/getTiktokId.ts`, `src/handlers/entityHandler.ts`

Identical in behavior to the Twitter fixer, but for TikTok URLs.

### Behavior

1. Detects URLs from `tiktok.com` that are **not** already using a fixer domain.
2. Extracts the TikTok author username and video ID via regex.
3. Constructs a fixed URL: `https://fxtiktok.com/{username}/video/{id}`.
4. Sends a new message in the format: `**{Author}** posted:\n{fixed URL}`.
5. **Deletes the original message.**

### Recognized Fixer Domain (skip processing)

- `fxtiktok.com`

---

## 5. Instagram Media Downloading

**Files:** `src/handlers/instagramHandler.ts`, `src/utils/instagramApi.ts`, `src/utils/instagramMedia.ts`, `src/utils/getInstagramId.ts`, `src/utils/downloadToBuffer.ts`, `src/utils/progressBar.ts`

The most complex feature. When a user posts an Instagram link, the bot attempts to **download the actual media** (photos and videos) from the post and send them directly into the Telegram chat as native media.

### End-to-End Flow

1. User posts an Instagram link (`instagram.com/p/...`, `/reel/...`, or `/reels/...`).
2. Bot **deletes the original message** immediately.
3. Bot sends a **progress message** with an ASCII progress bar (`[====                ] 20%`).
4. Extracts the **shortcode** from the URL pathname.
5. Calls the Instagram GraphQL API to fetch media metadata (see API details below).
6. Parses the API response to extract all media URLs (images and videos).
7. Downloads each media item to a **temporary file on disk** using streaming (memory-efficient).
8. Sends all media to the chat as a **Telegram media group** (album), with a caption like `**Author** posted: Instagram media (3 items)`.
9. **Cleans up temporary files** after sending.
10. **Deletes the progress message.**

### Instagram API Integration

- **Primary method:** GraphQL `query_hash` API (`2c4c2e343a8f64c625ba02b2aa12c7f8`).
- **Fallback method:** GraphQL `query_id` API (`9496392173716084`) — used when the primary method returns a `fail` status.
- Supports **authenticated requests** via `INSTAGRAM_COOKIES` environment variable (session cookies from browser).
- Uses a **mobile User-Agent** to mimic the Instagram app.

### Rate Limit Handling

- Enforces a **minimum 2-second delay** between requests.
- Implements **exponential backoff** on rate limit responses: retries after 1s, 2s, 5s, and 15s.
- Sends **status updates** to the Telegram progress message during long waits.
- On exhaustion of retries, reports the rate limit error and falls back to URL fixing (section 6).

### Media Type Support

| Media Type         | GraphQL (query_hash)             | Legacy (query_id)                |
|--------------------|----------------------------------|----------------------------------|
| Single Image       | `GraphImage` → `display_resources` (highest resolution) | `image_versions2.candidates` (sorted by quality) |
| Single Video       | `GraphVideo` → `video_url`       | `video_versions[0].url`         |
| Carousel (album)   | `GraphSidecar` → iterates `edge_sidecar_to_children` | `carousel_media[]` array        |

### Memory Optimization

- Downloads media to **temporary files** via Node.js streams (`pipeline`) instead of buffering entire files in memory.
- Processes media items **one at a time** to minimize peak memory usage.
- Sends in groups of up to **10 items** (Telegram media group limit).
- Cleans up files **immediately** after each group is sent.

### Fallback Behavior

If media download fails for any reason, the bot:
1. Sends an error message explaining the failure (with special messaging for rate limits).
2. Falls back to **URL fixing** (replacing `instagram.com` with `kkinstagram.com`).

---

## 6. Instagram URL Embed Fixing (Fallback)

**Files:** `src/utils/getInstagramId.ts`, `src/handlers/entityHandler.ts`

Used as a fallback when direct Instagram media downloading fails.

### Behavior

- Replaces `instagram.com` in the URL with `kkinstagram.com` for better Telegram embeds.
- Sends the fixed URL with the author attribution.

---

## 7. Duplicate Image Detection

**Files:** `src/handlers/imageHandler.ts`, `src/utils/imageCache.ts`, `src/utils/generateHash.ts`, `src/utils/resizeImage.ts`

When a user sends a photo in the group chat, the bot computes a **perceptual hash** of the image and checks for duplicates.

### How It Works

1. Intercepts all `photo` messages.
2. Retrieves the file link from Telegram's API (uses the smallest thumbnail for speed).
3. Downloads the image to a buffer.
4. Generates a **perceptual hash** using blockhash algorithm (8-bit by default, producing a hex string).
5. Compares the hash against the **image cache** (exact match).
6. **On cache hit:** Replies with a shaming image (hosted on Imgur) and a caption with the original poster's name and relative time (e.g., `"Found a similar image! Posted by Pedro, 2 hours ago."`). Uses the `s-ago` library for human-readable relative timestamps.
7. **On cache miss:** Adds the image hash to the cache.

### Image Cache Details

- In-memory array of `ImageCacheItem` objects (`{ hash, metadata: { date, author } }`).
- Maximum size: **50 entries** (FIFO eviction).
- No persistence — resets on restart.

### Perceptual Hashing

- Uses `blockhash-core` library with `bmvbhash` algorithm.
- Converts the image buffer to raw pixel data via `@canvas/image`.
- Default bit depth: **8** (produces 64-character hex hash).
- Matching is by **exact hash equality** (not Hamming distance).

### Image Resizing

- Utility for resizing images via `sharp` to configurable dimensions (default 30x30).
- Maximum allowed dimension: 100px.
- Resizing ensures alpha channel presence.

---

## 8. WebM to MP4 Conversion

**Files:** `src/utils/detectWebm.ts`, `src/utils/convertWebmToMp4.ts`, `src/handlers/entityHandler.ts`

Telegram does not natively preview `.webm` video links. When a user posts a message consisting **exclusively** of a `.webm` URL, the bot downloads it, converts it to MP4, and sends it as a native Telegram video.

### Detection

- Checks if the entire message text (after trimming) is a single URL ending in `.webm` (case insensitive, supports query parameters).

### Conversion Pipeline

1. Downloads the `.webm` file via streaming to a temporary file (memory-efficient).
2. Converts using **ffmpeg** (via `fluent-ffmpeg`) with optimized settings:
   - Video codec: `libx264`
   - Audio codec: `aac` at `128k` bitrate
   - Preset: `ultrafast`
   - CRF: `28`
   - Uses all CPU cores (`-threads 0`)
   - Optimized for fast decoding (`-tune fastdecode`)
   - Fast-start enabled for streaming (`-movflags +faststart`)
3. Sends the converted MP4 as a Telegram video with caption: `**{Author}** shared a video (converted from webm)`.
4. **Deletes the original message** containing the `.webm` URL.
5. Cleans up all temporary files (input `.webm` and output `.mp4`).

### Ultra-Fast Conversion Mode

An alternative conversion mode attempts to **copy the audio stream** directly (no re-encoding) for even faster conversion. If audio copy fails (incompatible codec), it falls back to full re-encoding.

### Error Handling

- On conversion failure, sends an error message to the chat.
- Temporary files are cleaned up in all code paths (success, failure, and exceptions).

---

## 9. Bot Commands

**File:** `index.ts`

### `/help`

Lists the available commands configured in `config.json`:
- Threshold setting command
- Resolution setting command
- Sensitivity increase command

The command names are configurable via `config.json` messages.

---

## 10. Direct Reply Handling

**File:** `src/handlers/replyHandler.ts`

When the bot is directly mentioned or replied to, it responds with a configurable message.

### Behavior

- If `config.messages.noReplying` is defined (array of strings), picks a **random response** from the array.
- Otherwise, falls back to the `directReplyNoOp` message (e.g., `"Functionality not implemented, {username}."`).
- Always replies to the original message.

---

## 11. Random Image Fetching

**File:** `src/utils/getRandomImage.ts`

Utility for fetching random images from configurable API endpoints.

### How It Works

- Picks a **random endpoint** from the `URL_ENDPOINTS` array in `config.json`.
- Sends a GET request and extracts the `url` field from the JSON response.
- Designed to be used as a bot feature (e.g., in response to a command).

---

## 12. Configuration System

**Files:** `src/utils/config.ts`, `config.json.example`

The bot loads its configuration from a `config.json` file at startup. Configuration is validated at load time — the bot exits with an error if the config is invalid.

### Config Structure

| Field                        | Type       | Description                                                     |
|------------------------------|------------|-----------------------------------------------------------------|
| `URL_ENDPOINTS`              | `string[]` | List of API endpoints that return random images                 |
| `messages.foundLinkSentBy`   | `string`   | Message prefix for duplicate link detection                     |
| `messages.foundImageSentBy`  | `string`   | Message prefix for duplicate image detection                    |
| `messages.minutesAgo`        | `string`   | Suffix for time-ago display                                     |
| `messages.directReplyNoOp`   | `string`   | Fallback response when directly mentioned                       |
| `messages.noReplying`        | `string[]` | Pool of random responses when mentioned                         |
| `messages.sendingRandomImage`| `string`   | Message when sending a random image                             |
| `messages.setThresholdCommand`| `string`  | Command name for setting similarity threshold                   |
| `messages.setResolutionCommand`| `string` | Command name for setting image comparison resolution            |
| `messages.increaseSensitivityCommand` | `string` | Command name for increasing sensitivity               |
| `messages.reduceSensitivity*`| `string`   | Messages and identifiers for sensitivity reduction              |
| `messages.invalidResolution` | `string`   | Error message for invalid resolution input                      |
| `messages.invalidThreshold`  | `string`   | Error message for invalid threshold input                       |
| `messages.resolutionSetMessage` | `string`| Confirmation message when resolution is changed                 |
| `messages.thresholdSetMessage`| `string`  | Confirmation message when threshold is changed                  |
| `messages.similarityThreshold`| `string`  | Prefix for displaying current threshold                         |
| `messages.similarPixels`     | `string`   | Prefix for displaying pixel similarity count                    |

### Environment Variables

| Variable              | Required | Description                                                    |
|-----------------------|----------|----------------------------------------------------------------|
| `TELEGRAM_TOKEN`      | Yes      | Telegram Bot API token (from BotFather)                        |
| `INSTAGRAM_COOKIES`   | No       | Instagram session cookies for authenticated API requests. Format: `sessionid=xxx; csrftoken=yyy; ds_user_id=zzz` |

---

## 13. Logging

**File:** `src/utils/logger.ts`

A thin wrapper around `console` methods providing four log levels:

- `logger.log()` → `console.log()`
- `logger.error()` → `console.error()`
- `logger.warn()` → `console.warn()`
- `logger.info()` → `console.info()`

Additionally, the Instagram API module includes extensive inline logging for debugging API interactions, including request timing, retry attempts, and response summaries.

---

## 14. Error Handling & Graceful Shutdown

**File:** `index.ts`

### Global Error Handler

- `bot.catch()` sends a humorous error message to the chat (`"sipchan died lol"`) and logs the full error.

### Graceful Shutdown

- Listens for `SIGINT` and `SIGTERM` signals.
- Calls `bot.stop()` to cleanly shut down the Telegraf polling connection.

### Per-Handler Error Handling

- Each message handler wraps its logic in `try/catch` blocks.
- The entity handler catches errors at the top level and logs them.
- The Instagram handler implements multi-layer error handling with fallbacks.
- The WebM converter ensures temporary file cleanup in all error paths.

---

## 15. Developer Tooling

### Build & Run

| Command          | Description                                        |
|------------------|----------------------------------------------------|
| `npm start`      | Development mode with `nodemon` (auto-restart on file changes in `src/`) |
| `npm run prod`   | Production mode via `tsx`                          |
| `npm run lint`   | Runs ESLint and TypeScript type checking (`tsc --noEmit`) |

### Code Quality

- **ESLint** with `@typescript-eslint` plugin and Prettier integration.
- **Prettier** configured for: trailing commas (ES5), 2-space tabs, semicolons, single quotes.
- **TypeScript** with strict ESM module configuration, targeting ES2015.

### TypeScript Configuration

- ESM modules (`"module": "ESNext"`)
- Allows `.ts` extension imports (`allowImportingTsExtensions`)
- JSON module resolution enabled
- ES module interop enabled
- No emit (type checking only, runtime uses `tsx`/`ts-node`)

---

## 16. Architecture & Project Structure

```
nodobot/
├── index.ts                          # Entry point: bot initialization, command registration, handler wiring
├── config.json                       # Runtime configuration (not committed)
├── config.json.example               # Configuration template
├── package.json                      # Dependencies and scripts
├── tsconfig.json                     # TypeScript configuration
├── nodemon.json                      # Nodemon configuration for dev mode
├── .env.example                      # Environment variable template
├── .eslintrc.cjs                     # ESLint configuration
├── .prettierrc                       # Prettier configuration
├── misc/
│   └── logo.svg                      # Bot logo
└── src/
    ├── types.ts                      # Shared TypeScript type definitions
    ├── handlers/
    │   ├── index.ts                  # Handler barrel exports
    │   ├── entityHandler.ts          # URL/entity message processing (links, embeds, webm)
    │   ├── imageHandler.ts           # Photo message processing (duplicate detection)
    │   ├── instagramHandler.ts       # Instagram media download and delivery
    │   └── replyHandler.ts           # Direct mention/reply responses
    └── utils/
        ├── index.ts                  # Utility barrel exports
        ├── config.ts                 # Configuration loading and validation
        ├── logger.ts                 # Logging wrapper
        ├── linkCache.ts              # In-memory link duplicate cache
        ├── imageCache.ts             # In-memory image duplicate cache
        ├── generateHash.ts           # Perceptual image hashing
        ├── resizeImage.ts            # Image resizing via sharp
        ├── downloadToBuffer.ts       # HTTP download utilities (buffer and file streaming)
        ├── getYoutubeId.ts           # YouTube URL parser
        ├── getTwitterId.ts           # Twitter/X URL parser and fixer
        ├── getTiktokId.ts            # TikTok URL parser and fixer
        ├── getInstagramId.ts         # Instagram URL parser and fixer
        ├── instagramApi.ts           # Instagram GraphQL API client with retry logic
        ├── instagramMedia.ts         # Instagram media response parser
        ├── detectWebm.ts             # WebM URL detector
        ├── convertWebmToMp4.ts       # WebM→MP4 conversion via ffmpeg
        ├── getRandomImage.ts         # Random image API fetcher
        └── progressBar.ts            # ASCII progress bar generator
```

### Key Dependencies

| Package            | Version  | Purpose                                    |
|--------------------|----------|--------------------------------------------|
| `telegraf`         | ^4.13.1  | Telegram Bot API framework                 |
| `sharp`            | ^0.33.3  | Image processing (resize, format convert)  |
| `fluent-ffmpeg`    | ^2.1.3   | FFmpeg wrapper for video conversion        |
| `perceptual-hash`  | ^0.1.1   | Perceptual image hashing                   |
| `pixelmatch`       | ^5.3.0   | Pixel-level image comparison               |
| `s-ago`            | ^2.2.0   | Human-readable relative timestamps         |
| `dotenv`           | ^17.2.3  | Environment variable loading               |
| `node-fetch`       | (dep)    | HTTP client for downloading media          |
| `typescript`       | ^5.1.6   | TypeScript compiler                        |

### Design Patterns

- **Handler pattern:** Each message type (text, photo) has a dedicated handler module.
- **Barrel exports:** Both `handlers/` and `utils/` use `index.ts` files to re-export all modules.
- **FIFO cache:** Both link and image caches use fixed-size arrays with `shift()` eviction.
- **Streaming I/O:** Large file downloads use Node.js stream `pipeline` instead of buffering in memory.
- **Graceful degradation:** Instagram media download falls back to URL fixing on failure; WebM conversion reports errors but doesn't crash the bot.
- **Deferred cleanup:** Conversion functions return a `cleanup()` callback so callers control when temporary files are deleted.

---

## 17. Feature Matrix (Trigger -> Behavior -> Outcome)

This matrix lists every implemented runtime behavior in one place.

| Trigger in Chat | Detection Logic | Primary Action | Secondary/Failure Action | User-Visible Outcome |
|-----------------|-----------------|----------------|--------------------------|----------------------|
| Text message containing URL entity | Telegram `entities` with `type === 'url'` | Normalize URL and check link cache | If duplicate: reply with original poster + time delta | Duplicate-link warning reply |
| First-time Twitter/X URL (`x.com` / `twitter.com`) | Extract tweet ID + username; check not already fixer domain | Replace with `fxtwitter.com` URL | On send/delete failure: error reply | Better rich embed + original removed |
| First-time TikTok URL (`tiktok.com`) | Extract video ID + username; check not already fixer domain | Replace with `fxtiktok.com` URL | On send/delete failure: error reply | Better rich embed + original removed |
| First-time Instagram URL | Extract pathname, shortcode, call Instagram API | Download media and resend as Telegram media group | On API/download failure: fallback to `kkinstagram.com` URL replacement | Native Telegram media or fallback link |
| Message text is only a `.webm` URL | Regex match (`isExclusiveWebmUrl`) | Download, transcode to MP4, resend video, delete original | Reply with conversion error and clean up temp files | Converted inline video appears in chat |
| Photo message | Download Telegram photo + compute hash | Check image cache and store if new | If duplicate: send duplicate image warning with time ago | Duplicate-image warning reply |
| `/help` command | Bot command handler | Print configured command IDs | N/A | Semicolon-separated command list |
| Runtime startup | Missing `TELEGRAM_TOKEN` env var | Log error and exit process | N/A | Bot does not start without token |
| Unhandled bot exception | Global `bot.catch` handler | Reply with failure message + log error | N/A | Chat receives `sipchan died lol` |

---

## 18. Detailed Feature Behavior by Platform

### YouTube

- Extracts canonical video ID from long URLs (`watch?v=`), short URLs (`youtu.be`), embed URLs, and shorts URLs.
- Stores normalized key as `YOUTUBE-{id}` in link cache.
- Duplicate detection works across different YouTube URL formats that map to the same ID.

### Twitter / X

- Recognizes both `x.com` and `twitter.com` sources.
- Recognizes already-fixed domains (`fxtwitter.com`, `vxtwitter.com`) to avoid re-rewriting.
- Uses tweet status ID as canonical duplicate key: `TWITTER-{statusId}`.
- Fixer URL generator always prefers `fxtwitter.com`.

### TikTok

- Recognizes standard `tiktok.com/@user/video/{id}` links and already-fixed links.
- Uses video ID as canonical duplicate key: `TIKTOK-{videoId}`.
- Fixer URL generator emits `fxtiktok.com` format.

### Instagram

- Accepts `/p/{shortcode}`, `/reel/{shortcode}`, `/reels/{shortcode}` and bare shortcode path patterns.
- Canonical duplicate key is `INSTAGRAM-{pathname}`.
- Attempts full media extraction first (image/video/carousel); URL fixing is fallback-only.

---

## 19. Instagram Downloader Internals (Deep Dive)

### API Strategy

1. Try GraphQL endpoint with `query_hash`.
2. If response includes `status: fail`, switch to fallback `query_id` endpoint.
3. In both paths, classify and retry rate-limit errors with backoff.

### Rate-Limit Policy

- Global inter-request floor: **2 seconds**.
- Retry delays: **1s -> 2s -> 5s -> 15s**.
- Status callback updates in-chat progress text during long waits.

### Media Extraction Rules

- GraphQL response:
  - `GraphImage`: pick highest-resolution `display_resources` entry.
  - `GraphVideo`: use `video_url`.
  - `GraphSidecar`: walk all edges and collect mixed media.
- Legacy response:
  - `carousel_media`: iterate each item.
  - `image_versions2.candidates`: sort quality and select preferred candidate.
  - `video_versions`: select first available version.

### Delivery Strategy

- Download each media item to temp file (`downloadToFile`) to reduce RAM usage.
- Batch-send with `replyWithMediaGroup` up to Telegram group size limits.
- If group send fails, fallback to per-item send.
- Delete temp files after each successful send cycle.

---

## 20. Caching Model and Data Lifecycle

### Link Cache

- Capacity: 50 entries.
- Data retained per entry: normalized URL key + author + unix timestamp.
- Replacement policy: oldest-first eviction (FIFO).
- Persistence: in-memory only.

### Image Cache

- Capacity: 50 entries.
- Data retained per entry: perceptual hash + author + unix timestamp.
- Match strategy: exact hash equality.
- Persistence: in-memory only.

### Operational Implication

Because caches are volatile, historical duplicate detection is bounded by:

- Process uptime
- Cache capacity limit
- Message type normalization coverage

---

## 21. Operational Characteristics

### Runtime Dependencies

- Node.js runtime with ESM/TypeScript execution support.
- FFmpeg installed and reachable by `fluent-ffmpeg` for WebM conversion.
- Network access to Telegram APIs and remote media hosts.

### Startup Guarantees

- Hard-fails without `TELEGRAM_TOKEN`.
- Hard-fails if `config.json` is missing/invalid schema.
- Registers text + photo listeners and starts long-polling on launch.

### Resource Management

- Uses temporary directory for downloaded/transcoded media.
- Exposes explicit cleanup callbacks for temp files.
- Attempts cleanup on both success and failure paths.

---

## 22. Implemented but Not Fully Wired Features

These capabilities are implemented in utilities/handlers but not fully exposed by command routing in the current entrypoint:

- `replyHandler` (direct mention/no-reply behavior) is exported but not invoked in `index.ts`.
- `getRandomImage` utility exists but no active command currently calls it.
- Image resize/sensitivity/threshold messaging fields are present in config schema and `/help`, but concrete command handlers for changing them are not currently registered.

This means the codebase contains partial groundwork for additional chat commands, even if those command paths are not yet active.

---

## 23. Reliability and Failure Modes

### Expected Recoverable Failures

- Instagram API rate limiting -> retries -> fallback URL replacement.
- Individual Instagram media item download failure -> continue remaining items.
- Media group send failure -> fallback to item-by-item send.
- WebM conversion failure -> user-facing error reply.

### Non-Recoverable Failures

- Missing mandatory environment variables.
- Invalid config schema at startup.
- Catastrophic bot errors captured by global handler (bot remains running unless process exits externally).

---

## 24. Suggested Documentation Usage

Use this document as:

- **Operator manual:** what the bot does in live chats and how it reacts.
- **Maintenance map:** where each feature lives in code.
- **Change-impact guide:** what components are touched when modifying link, media, or cache behavior.

For future updates, keep this file synchronized whenever new handlers, commands, or cache strategies are added.
