# Web UI Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM node:25-alpine AS builder

WORKDIR /app

# Install pnpm (version from packageManager in package.json)
RUN corepack enable

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/web-ui/package.json ./packages/web-ui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages/core ./packages/core
COPY packages/web-ui ./packages/web-ui

# Build
RUN pnpm --filter @aas-ai-editor/core build
RUN pnpm --filter @aas-ai-editor/web-ui build

# Production stage - serve with nginx
FROM nginx:alpine AS production

# Copy nginx configuration
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf

# Copy built files
COPY --from=builder /app/packages/web-ui/dist /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
