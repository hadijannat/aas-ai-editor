# MCP Server Security Guide

This document describes how to configure and deploy the AAS AI Editor MCP server securely for production use.

## Security Features

| Feature | Status | Configuration |
|---------|--------|---------------|
| API Key Authentication | ✅ | `MCP_API_KEYS` |
| Path Traversal Protection | ✅ | `MCP_ALLOWED_DIRECTORIES` |
| Input Validation | ✅ | Built-in Zod schemas |
| Session Binding | ✅ | `MCP_ENFORCE_SESSION_BINDING` |
| Rate Limiting | ✅ | `RATE_LIMIT_MAX` |
| CORS | ✅ | `CORS_ALLOWED_ORIGINS` |
| Helmet (Security Headers) | ✅ | Built-in |
| TLS | ⚠️ | Use reverse proxy |

## Environment Variables

### Required for Production

```bash
# API Authentication (comma-separated list of valid API keys)
MCP_API_KEYS=your-secure-api-key-1,your-secure-api-key-2

# Claude AI API Key
ANTHROPIC_API_KEY=sk-ant-...
```

### Security Configuration

```bash
# File system sandboxing (colon-separated list of allowed directories)
MCP_ALLOWED_DIRECTORIES=/data/aasx:/tmp/uploads

# Workspace directory (default for file operations)
MCP_WORKSPACE_DIR=/data/aasx

# CORS allowed origins (comma-separated, use specific domains in production)
CORS_ALLOWED_ORIGINS=https://your-app.example.com,https://admin.example.com

# Rate limiting (requests per minute per IP)
RATE_LIMIT_MAX=100

# Session timeout (milliseconds, default: 30 minutes)
MCP_SESSION_TIMEOUT_MS=1800000

# Maximum concurrent sessions
MCP_MAX_SESSIONS=100

# Proxy trust (if behind nginx/load balancer)
TRUST_PROXY=1
```

### Optional

```bash
# Server configuration
MCP_SERVER_PORT=3001
MCP_SERVER_HOST=0.0.0.0

# Logging
LOG_LEVEL=info
NODE_ENV=production

# Validation service URL
VALIDATION_SERVICE_URL=http://validation-service:8000
```

## Deployment Checklist

### ✅ Pre-deployment

- [ ] Generate strong API keys (at least 32 characters, random)
- [ ] Configure allowed directories to limit file system access
- [ ] Set specific CORS origins (never use `*` in production)
- [ ] Configure rate limits appropriate for your use case
- [ ] Set up TLS termination (nginx, Cloudflare, AWS ALB)
- [ ] Review and test session timeout settings

### ✅ Infrastructure

- [ ] Deploy behind a reverse proxy with TLS
- [ ] Configure firewall to only allow necessary ports
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Set up automated backups for AASX files

### ✅ API Key Management

```bash
# Generate a secure API key
openssl rand -hex 32

# Example output: 7f8c9d2e1a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d
```

Store API keys securely:
- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- Never commit API keys to version control
- Rotate keys periodically
- Use different keys for different clients/environments

## Authentication

The MCP server supports two authentication methods:

### 1. X-API-Key Header

```bash
curl -X POST https://your-mcp-server/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'
```

### 2. Bearer Token

```bash
curl -X POST https://your-mcp-server/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'
```

### Public Endpoints

These endpoints don't require authentication:
- `GET /health` - Health check endpoint
- `GET /` - Root endpoint

## File System Security

### Path Sandboxing

All file operations are restricted to allowed directories:

```bash
# Only allow access to /data/aasx and /tmp/uploads
MCP_ALLOWED_DIRECTORIES=/data/aasx:/tmp/uploads
```

The server will reject:
- Paths outside allowed directories
- Path traversal attempts (`../`, `..%2f`, etc.)
- Paths with null bytes
- Excessively long paths (>4096 characters)

### Recommended Directory Structure

```
/data/aasx/
├── uploads/          # Temporary upload directory
├── documents/        # Permanent AASX storage
└── exports/          # Generated exports
```

## Session Security

### Session Binding

Sessions are bound to client identity (IP address) to prevent session hijacking:

```bash
# Enable session binding (default: true)
MCP_ENFORCE_SESSION_BINDING=true
```

When enabled, requests with a session ID from a different IP address will be rejected.

### Session Timeouts

Configure session lifetime based on your security requirements:

```bash
# 30 minutes (default)
MCP_SESSION_TIMEOUT_MS=1800000

# 1 hour
MCP_SESSION_TIMEOUT_MS=3600000

# 5 minutes (high security)
MCP_SESSION_TIMEOUT_MS=300000
```

## Rate Limiting

Rate limiting prevents abuse and DoS attacks:

```bash
# Allow 100 requests per minute per IP (default)
RATE_LIMIT_MAX=100

# Stricter limit for high-security deployments
RATE_LIMIT_MAX=30
```

## TLS Configuration

The MCP server does not handle TLS directly. Deploy behind a reverse proxy:

### nginx Example

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Docker Deployment

### docker-compose.yml

```yaml
version: '3.8'

services:
  mcp-server:
    build: ./packages/mcp-server
    environment:
      - NODE_ENV=production
      - MCP_API_KEYS=${MCP_API_KEYS}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - MCP_ALLOWED_DIRECTORIES=/data
      - MCP_WORKSPACE_DIR=/data
      - CORS_ALLOWED_ORIGINS=https://your-app.example.com
      - RATE_LIMIT_MAX=100
      - TRUST_PROXY=1
    volumes:
      - ./data:/data:rw
    ports:
      - "3001:3001"
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Monitoring

### Health Check

```bash
curl https://your-mcp-server/health
# {"status":"ok","version":"0.1.0"}
```

### Recommended Metrics

Monitor these metrics:
- Request rate and latency
- Error rate by endpoint
- Session count
- File operation counts
- Rate limit hits
- Authentication failures

### Log Format

The server uses structured JSON logging (pino):

```json
{
  "level": 30,
  "time": 1699999999999,
  "msg": "MCP request received",
  "method": "tools/call",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Security Incident Response

### Authentication Failures

Monitor for patterns indicating brute force attempts:
- Multiple failed auth attempts from same IP
- Scanning for common API key patterns

### Path Traversal Attempts

The server logs rejected path traversal attempts:

```json
{
  "level": 40,
  "msg": "Path validation failed",
  "path": "../../../etc/passwd",
  "error": "Path contains invalid sequences"
}
```

### Session Hijacking Attempts

When session binding rejects a request:

```json
{
  "level": 40,
  "msg": "Session bound to different IP address",
  "sessionId": "...",
  "ip": "attacker-ip"
}
```

## Compliance Considerations

### Data Protection

- AASX files may contain sensitive industrial data
- Configure encryption at rest for storage volumes
- Implement data retention policies
- Consider geographic data residency requirements

### Audit Logging

Enable detailed logging for compliance:

```bash
LOG_LEVEL=info  # Logs all requests
```

For stricter compliance, consider adding:
- User identification logging
- Data access logging
- Change tracking
