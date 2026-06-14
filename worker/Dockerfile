FROM node:22-bookworm-slim

WORKDIR /app

# Install Playwright system deps once in the image (faster deploys than runtime install)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Bake Chromium into the image so deploys skip browser download
RUN npx playwright install chromium

COPY src ./src

ENV NODE_ENV=production
ENV WORKER_CONCURRENCY=1

CMD ["node", "src/index.js"]
