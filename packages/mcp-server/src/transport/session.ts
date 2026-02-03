/**
 * Session Management
 *
 * Manages client sessions with document state,
 * pending operations, and undo/redo stacks.
 */

import { v4 as uuidv4 } from 'uuid';
import type { SessionData, ClientIdentity } from '../types.js';

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Session timeout in milliseconds */
  timeoutMs: number;

  /** Maximum sessions allowed */
  maxSessions: number;

  /** Cleanup interval in milliseconds */
  cleanupIntervalMs: number;

  /** Whether to enforce client identity binding */
  enforceClientBinding: boolean;
}

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  timeoutMs: 30 * 60 * 1000, // 30 minutes
  maxSessions: 100,
  cleanupIntervalMs: 60 * 1000, // 1 minute
  enforceClientBinding: true,
};

/**
 * Session access result
 */
export interface SessionAccessResult {
  session?: SessionData;
  error?: string;
}

/**
 * Session manager for MCP connections
 */
export class SessionManager {
  private sessions = new Map<string, SessionData>();
  private config: SessionConfig;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.startCleanup();
  }

  /**
   * Create a new session
   */
  create(clientIdentity?: ClientIdentity): SessionData {
    // Check max sessions
    if (this.sessions.size >= this.config.maxSessions) {
      this.evictOldest();
    }

    const session: SessionData = {
      id: uuidv4(),
      createdAt: new Date(),
      lastActivityAt: new Date(),
      clientIdentity,
      pendingOperations: [],
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get session by ID
   */
  get(id: string): SessionData | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get session with client identity validation
   * Returns an error if client identity doesn't match
   */
  getWithValidation(id: string, clientIdentity?: ClientIdentity): SessionAccessResult {
    const session = this.sessions.get(id);

    if (!session) {
      return { error: 'Session not found' };
    }

    // Skip validation if not enforced or no identity stored
    if (!this.config.enforceClientBinding || !session.clientIdentity) {
      return { session };
    }

    // Skip validation if no identity provided (backwards compatibility)
    if (!clientIdentity) {
      return { session };
    }

    // Validate client identity matches
    if (session.clientIdentity.ip !== clientIdentity.ip) {
      return { error: 'Session bound to different IP address' };
    }

    // User-Agent check is advisory (can change with browser updates)
    // Log warning but don't reject
    // if (session.clientIdentity.userAgent !== clientIdentity.userAgent) { ... }

    return { session };
  }

  /**
   * Update session activity timestamp
   */
  touch(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }

  /**
   * Delete a session
   */
  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * Get all active sessions
   */
  list(): SessionData[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  get count(): number {
    return this.sessions.size;
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Stop cleanup timer
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Remove expired sessions
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt.getTime() > this.config.timeoutMs) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      this.sessions.delete(id);
    }
  }

  /**
   * Evict oldest session when at capacity
   */
  private evictOldest(): void {
    let oldest: SessionData | undefined;
    let oldestId: string | undefined;

    for (const [id, session] of this.sessions) {
      if (!oldest || session.lastActivityAt < oldest.lastActivityAt) {
        oldest = session;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId);
    }
  }
}
