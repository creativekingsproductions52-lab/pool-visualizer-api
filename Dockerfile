FROM node:20-bookworm-slim

WORKDIR /app

# Install Linux dependencies required by Chromium + Mesa for software WebGL
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    wget \
    xdg-utils \
    libegl1-mesa \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    libgles2-mesa \
    mesa-utils \
    libosmesa6 \
    libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

# Install Node dependencies first for better layer caching
COPY package*.json ./
RUN npm install

# Install Playwright Chromium browser with all dependencies
# Use full chromium (not headless-shell) for WebGL/Cesium support
RUN npx playwright install chromium --with-deps

# Set environment to prefer full Chromium over headless shell
ENV PLAYWRIGHT_CHROMIUM_USE_HEADLESS_NEW=1

# Copy application source
COPY . .

EXPOSE 3001

CMD ["npm", "start"]
