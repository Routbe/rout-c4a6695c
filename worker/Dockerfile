FROM oven/bun:1.4.4-debian
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg chromium ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/package.json worker/bun.lock ./worker/
RUN bun install --cwd worker --frozen-lockfile
RUN ln -s /app/worker/node_modules /app/node_modules
COPY worker/main.ts worker/queue.ts worker/media.ts worker/fetch.ts worker/events.ts worker/render.ts ./worker/
COPY src/lib/omni-ingest.ts src/lib/omni-realtime.ts ./src/lib/
USER bun
ENV HOST=0.0.0.0
ENV CHROMIUM_PATH=/usr/bin/chromium
EXPOSE 8090
CMD ["bun", "run", "worker/main.ts"]