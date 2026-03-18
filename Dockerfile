FROM denoland/deno:2.4.5

WORKDIR /app

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

USER deno

COPY --chown=deno:deno deno.json deno.lock ./
COPY --chown=deno:deno apps ./apps
COPY --chown=deno:deno packages ./packages

RUN deno cache --lock=deno.lock apps/bot/src/main.ts

CMD ["deno", "task", "start"]
