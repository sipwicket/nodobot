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
  && pip3 install --no-cache-dir --break-system-packages gallery-dl \
  && printf '%s\n' '#!/bin/sh' 'exec python3 -m gallery_dl "$@"' > /usr/local/bin/gallery-dl \
  && chmod +x /usr/local/bin/gallery-dl \
  && deno run -A npm:playwright install --with-deps chromium \
  && chown -R deno:deno /ms-playwright  \
  && chown -R deno:deno /ms-playwright /deno-dir \
  && rm -rf /var/lib/apt/lists/*

USER deno

COPY --chown=deno:deno deno.json deno.lock ./
COPY --chown=deno:deno apps ./apps
COPY --chown=deno:deno packages ./packages

RUN deno cache --lock=deno.lock apps/bot/src/main.ts

CMD ["deno", "task", "start"]
