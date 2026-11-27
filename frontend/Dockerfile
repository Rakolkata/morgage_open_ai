FROM node:22-bookworm-slim

WORKDIR /app

# Install openssl and curl (required for Prisma client and health checks)
RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

# Install npm dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the frontend source code
COPY . .

# Ensure uploads directory exists inside frontend container
RUN mkdir -p /app/uploads

# Build-time environment variable to satisfy Prisma build requirements
ENV DATABASE_URL="postgresql://postgres:admin@db:5432/mortgage_ai_db"
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Synchronize database schema and start Next.js production server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]
