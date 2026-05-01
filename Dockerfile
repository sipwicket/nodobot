FROM denoland/deno:2.4.5

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    python3 \
    python3-pip \
  && pip3 install --no-cache-dir --break-system-packages instaloader==4.15.1 \
  && deno run -A npm:playwright install --with-deps chromium \
  && chown -R deno:deno /ms-playwright \
  && rm -rf /var/lib/apt/lists/*

USER deno

COPY --chown=deno:deno deno.json deno.lock ./
COPY --chown=deno:deno apps ./apps
COPY --chown=deno:deno packages ./packages

RUN deno cache --lock=deno.lock apps/bot/src/main.ts

CMD ["deno", "task", "start"]
