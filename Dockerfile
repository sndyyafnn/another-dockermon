FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application
COPY server/ ./server/
COPY public/ ./public/

EXPOSE 3200

CMD ["node", "server/index.js"]
