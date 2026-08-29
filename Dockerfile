FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application
COPY server/ ./server/
COPY public/ ./public/

# Create non-root user (Docker socket access still needed)
RUN addgroup -g 999 docker || true
RUN adduser -D -u 1001 nocapp && adduser nocapp docker || true

EXPOSE 3000

USER nocapp

CMD ["node", "server/index.js"]
