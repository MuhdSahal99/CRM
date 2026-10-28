# T8.11 (ADR-0010): the worker image with a pinned Chromium for PDFs. Build from the repo root: docker build -f apps/worker/Dockerfile .
# Chromium has no network at run time (the worker blocks every request but data:), and its version is bumped here on its own schedule.
FROM node:24-bookworm-slim

# Pinned build of Chrome for Testing; the same major as the Chromium the PDF tests run against.
ARG CHROME_VERSION=156.0.8078.4

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fonts-noto-core libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 libcairo2 libasound2 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable
# The root .dockerignore keeps .env*, .git and node_modules out of the context: secrets arrive at run time only.
COPY . .
RUN pnpm install --frozen-lockfile --filter worker... \
 && pnpm dlx @puppeteer/browsers install chrome@${CHROME_VERSION} --path /opt/chrome \
 && ln -s "$(find /opt/chrome -name chrome -type f | head -1)" /usr/local/bin/chromium

ENV CHROMIUM_PATH=/usr/local/bin/chromium NODE_ENV=production
# Chromium keeps its sandbox on, so the worker runs unprivileged. Docker's default seccomp profile blocks the user namespaces the sandbox
# needs: run with a Chromium seccomp profile (--security-opt seccomp=chromium.json), not with --no-sandbox or --privileged.
RUN chown -R node:node /app
USER node
CMD ["pnpm", "--filter", "worker", "start"]
