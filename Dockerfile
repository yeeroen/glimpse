FROM node:24-slim

# Fonts for emoji and common web text (not pulled in by Playwright)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies, then Chromium plus the system libraries it needs
# for this Playwright version and Debian release
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npx playwright install --with-deps --only-shell chromium

# Copy source and build
COPY . .
RUN npm run build

# Expose default port
ENV PORT=3000
EXPOSE 3000

# Run the production server
CMD ["node", ".output/server/index.mjs"]
