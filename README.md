# Sip-chan

![Sip-chan](./misc/logo.png)

## Features

- Duplicate link detection and shaming
- Duplicate image detection and shaming
- Whines at you when you mention her
- Fixes Twitter/X, TikTok, Instagram embeds
- Downloads Instagram media into chat (with fallback fixer link)
- Converts `.webm` links into MP4 videos

## Requirements

- [Deno](https://deno.com/)
- [ffmpeg](https://ffmpeg.org/) (required for WebM → MP4 conversion)
- [Python 3](https://www.python.org/) with [gallery-dl](https://github.com/mikf/gallery-dl) on `PATH` (installed via pip in the Docker image; required for native Instagram downloads)
- A telegram bot token
  - You can get one by talking to [BotFather](https://t.me/botfather)

## Getting Started

1. Install Deno and ffmpeg
2. Set the environment variable `TELEGRAM_TOKEN` to your bot token
   - Bash: `export TELEGRAM_TOKEN=<your token>`
   - PowerShell: `$env:TELEGRAM_TOKEN = "<your token>"`
3. (Recommended) Configure gallery-dl cookies for reliable Instagram downloads:
   - Instagram requires authentication; gallery-dl no longer supports username/password login for Instagram and will be redirected to the login page when run anonymously.
   - Export `cookies.txt` from a logged-in browser session (e.g. *Get cookies.txt LOCALLY* for Chrome, *cookies.txt* for Firefox). Make sure `sessionid`, `csrftoken`, and `ds_user_id` are present.
   - Place the file at the **project root** as `cookies.txt`. The bot reads it via `INSTAGRAM_COOKIES_FILE` / `GALLERY_DL_COOKIES_FILE` / `COOKIES_FILE` (defaulting to `./cookies.txt`, resolved against the project root).
4. Configure multitenancy placeholders:
   - **Subscription allowlist** (placeholder): `export ACTIVE_TENANTS="123456789,987654321"`
     - `TenantId` is the Telegram chat id (group id).
   - **Per-tenant settings overrides** (optional): create `apps/bot/tenant_overrides.json` and add a JSON object keyed by tenant/chat id.
5. Run in dev/watch mode:
   - `deno task dev`
6. Or run once:
   - `deno task start`

## Docker Deployment

1. Create and fill `.env` from `.env.example`:
   - `cp .env.example .env`
   - Required: `TELEGRAM_TOKEN`
2. Drop a `cookies.txt` (Mozilla/Netscape format) at the project root for Instagram auth.
   - `docker-compose.yml` bind-mounts `./cookies.txt` to `/app/cookies.txt:ro` and exports `COOKIES_FILE=/app/cookies.txt` automatically.
   - `create_host_path: false` is set on the bind, so compose will fail fast if `cookies.txt` is missing rather than silently creating an empty directory.
3. (Optional) Create `apps/bot/tenant_overrides.json` if you need per-tenant settings.
4. Build and start:
   - `docker compose up -d --build`
5. Check logs:
   - `docker compose logs -f bot`
6. Stop:
   - `docker compose down`

## Multitenancy Model (Current)

- Each Telegram group/chat is its own tenant (tenant id = `chat.id`).
- All features are **tenant-configurable** via the tenant settings schema in `packages/core/src/tenancy/tenantSettings.ts`.
- Subscription/license verification is currently a placeholder:
  - Tenants listed in `ACTIVE_TENANTS` are treated as active.
  - Others receive `settings.subscription.inactiveMessage` and expensive handlers are skipped.
- Runtime settings commands:
  - `/settings` shows current feature flags for the tenant.
  - `/enable <featureFlag>` and `/disable <featureFlag>` persist per-tenant flag changes.
  - In groups, only admins can update settings; in private chats, the sender can update.

## Pilot and Cutover Checklist

- Pick 1–3 pilot groups (their chat ids go in `ACTIVE_TENANTS`).
- For each pilot group, add a tenant override file entry if you want custom behavior.
- Validate feature parity (manual smoke test):
  - Duplicate link detection across YouTube/Twitter/TikTok/Instagram variants
  - Twitter/X embed rewriting to `fxtwitter.com`
  - TikTok embed rewriting to `fxtiktok.com`
  - Instagram native download (gallery-dl + cookies) + progress message + fallback to `kksave.com` on failure
  - `.webm` URL conversion to MP4 and original message deletion
  - Duplicate image detection (send same image twice)
  - `/help` output and direct-reply behavior
- Monitor logs and resource usage; disable Instagram download per tenant if gallery-dl is unstable or too slow for your environment.
- Cutover:
  - Deploy Deno bot alongside legacy bot (different bot token), or stop legacy and start Deno.
  - Keep rollback ready: stop Deno bot and restart legacy bot using the original Node entrypoint.
