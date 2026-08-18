FROM mcr.microsoft.com/playwright:v1.61.1-noble

# Set working directory
WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm ci
RUN npx playwright install --with-deps

# Copy all source files
COPY . .

# Default command to run Playwright tests
CMD ["npm", "test"]
