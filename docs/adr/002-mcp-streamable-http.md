# ADR-002: MCP Streamable HTTP Transport

## Status

Accepted

## Context

The Model Context Protocol (MCP) supports multiple transport mechanisms:
1. **stdio**: Process-based, for local tools
2. **Server-Sent Events (SSE)**: HTTP-based, unidirectional streaming
3. **Streamable HTTP**: HTTP-based, bidirectional with session management

We need to choose the transport for communication between the Web UI and MCP Server.

## Decision

Use **MCP Streamable HTTP** transport.

## Rationale

### Requirements

1. Browser-based client (no stdio possible)
2. Long-running operations (validation, AI generation)
3. Session state management (document open across requests)
4. Connection resilience (handle network interruptions)

### Why Not SSE?

SSE (Server-Sent Events) limitations:
- Unidirectional (server → client only)
- No native request/response correlation
- Connection state harder to manage
- Limited browser connection pooling

### Why Streamable HTTP?

1. **Bidirectional**: Full request/response model with streaming
2. **Session Management**: Built-in session ID tracking
3. **Connection Resumption**: Can reconnect with session context
4. **Chunked Responses**: Stream validation results, AI responses
5. **Standard HTTP**: Works with existing proxies, load balancers

## Implementation

### Session Flow

```
┌──────────┐                           ┌──────────┐
│  Client  │                           │  Server  │
└──────────┘                           └──────────┘
     │                                       │
     │──── POST /mcp (no session) ──────────▶│
     │                                       │
     │◀─── 200 + Mcp-Session: abc123 ────────│
     │                                       │
     │──── POST /mcp                         │
     │     Mcp-Session: abc123 ─────────────▶│
     │                                       │
     │◀─── 200 (streaming response) ─────────│
     │                                       │
```

### Headers

```http
# Request
POST /mcp HTTP/1.1
Content-Type: application/json
Mcp-Session: abc123  # After initial request

# Response
HTTP/1.1 200 OK
Content-Type: application/json
Mcp-Session: abc123
Transfer-Encoding: chunked  # For streaming
```

### Session State

```typescript
interface McpSession {
  id: string;
  documentState?: DocumentSession;
  createdAt: Date;
  lastActivity: Date;
  capabilities: string[];
}
```

## Consequences

### Positive

- Native session support reduces client complexity
- Streaming enables real-time progress updates
- Standard HTTP works everywhere
- Easy to add authentication middleware

### Negative

- More complex than simple REST
- Need session cleanup/timeout logic
- Slightly more overhead than SSE for simple cases

### Mitigations

- Implement automatic session cleanup
- Use heartbeat mechanism for connection health
- Document session timeout behavior

## References

- [MCP Specification - Transports](https://modelcontextprotocol.io/docs/concepts/transports)
- [Streamable HTTP Spec](https://modelcontextprotocol.io/docs/concepts/transports#streamable-http)
