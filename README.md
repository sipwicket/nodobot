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
- A telegram bot token
  - You can get one by talking to [BotFather](https://t.me/botfather)

## Getting Started

1. Install Deno and ffmpeg
2. Set the environment variable `TELEGRAM_TOKEN` to your bot token
   - Bash: `export TELEGRAM_TOKEN=<your token>`
   - PowerShell: `$env:TELEGRAM_TOKEN = "<your token>"`
3. (Optional) Set Instagram cookies for higher success rate:
   - `export INSTAGRAM_COOKIES="sessionid=...; csrftoken=...; ds_user_id=..."`
4. Configure multitenancy placeholders:
   - **Subscription allowlist** (placeholder): `export ACTIVE_TENANTS="123456789,987654321"`
     - `TenantId` is the Telegram chat id (group id).
   - **Per-tenant settings overrides**: copy `apps/bot/tenant_overrides.example.json` to `apps/bot/tenant_overrides.json` and edit.
5. Run in dev/watch mode:
   - `deno task dev`
6. Or run once:
   - `deno task start`

## Multitenancy Model (Current)

- Each Telegram group/chat is its own tenant (tenant id = `chat.id`).
- All features are **tenant-configurable** via the tenant settings schema in `packages/core/src/tenancy/tenantSettings.ts`.
- Subscription/license verification is currently a placeholder:
  - Tenants listed in `ACTIVE_TENANTS` are treated as active.
  - Others receive `settings.subscription.inactiveMessage` and expensive handlers are skipped.

## Pilot and Cutover Checklist

- Pick 1–3 pilot groups (their chat ids go in `ACTIVE_TENANTS`).
- For each pilot group, add a tenant override file entry if you want custom behavior.
- Validate feature parity (manual smoke test):
  - Duplicate link detection across YouTube/Twitter/TikTok/Instagram variants
  - Twitter/X embed rewriting to `fxtwitter.com`
  - TikTok embed rewriting to `vxtiktok.com`
  - Instagram native download + progress message + fallback to `kkinstagram.com` when rate-limited
  - `.webm` URL conversion to MP4 and original message deletion
  - Duplicate image detection (send same image twice)
  - `/help` output and direct-reply behavior
- Monitor logs and resource usage; increase `instagram.minRequestIntervalMs` or disable Instagram download per tenant if needed.
- Cutover:
  - Deploy Deno bot alongside legacy bot (different bot token), or stop legacy and start Deno.
  - Keep rollback ready: stop Deno bot and restart legacy bot using the original Node entrypoint.
