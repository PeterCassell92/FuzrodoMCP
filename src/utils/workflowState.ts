/**
 * Workflow State Persistence
 * Manages workflow state between multi-step executions
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

export interface PersistedWorkflowState {
  workflowId: string;
  resumeToken: string;
  state: any;
  timestamp: number;
  expiresAt: number;
}

/**
 * Manages workflow state persistence for multi-step workflows
 */
export class WorkflowStateManager {
  private states = new Map<string, PersistedWorkflowState>();
  private readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Save workflow state and return resume token
   */
  save(workflowId: string, state: any, ttl?: number): string {
    const resumeToken = `${workflowId}-${uuidv4()}`;
    const now = Date.now();
    const expiresAt = now + (ttl || this.DEFAULT_TTL);

    const persistedState: PersistedWorkflowState = {
      workflowId,
      resumeToken,
      state,
      timestamp: now,
      expiresAt,
    };

    this.states.set(resumeToken, persistedState);

    logger.debug('Saved workflow state', {
      workflowId,
      resumeToken,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    // Cleanup expired states
    this.cleanupExpired();

    return resumeToken;
  }

  /**
   * Load workflow state by resume token
   */
  load(resumeToken: string): any | null {
    const persisted = this.states.get(resumeToken);

    if (!persisted) {
      logger.warn('Resume token not found', { resumeToken });
      return null;
    }

    // Check if expired
    if (Date.now() > persisted.expiresAt) {
      logger.warn('Resume token expired', {
        resumeToken,
        expiredAt: new Date(persisted.expiresAt).toISOString(),
      });
      this.states.delete(resumeToken);
      return null;
    }

    logger.debug('Loaded workflow state', {
      workflowId: persisted.workflowId,
      resumeToken,
    });

    return persisted.state;
  }

  /**
   * Delete workflow state
   */
  delete(resumeToken: string): boolean {
    const deleted = this.states.delete(resumeToken);
    if (deleted) {
      logger.debug('Deleted workflow state', { resumeToken });
    }
    return deleted;
  }

  /**
   * Check if resume token exists and is valid
   */
  has(resumeToken: string): boolean {
    const persisted = this.states.get(resumeToken);
    if (!persisted) return false;

    // Check expiration
    if (Date.now() > persisted.expiresAt) {
      this.states.delete(resumeToken);
      return false;
    }

    return true;
  }

  /**
   * Get workflow ID from resume token
   */
  getWorkflowId(resumeToken: string): string | null {
    const persisted = this.states.get(resumeToken);
    return persisted?.workflowId || null;
  }

  /**
   * Cleanup expired states
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [token, persisted] of this.states.entries()) {
      if (now > persisted.expiresAt) {
        this.states.delete(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired workflow states', { count: cleanedCount });
    }
  }

  /**
   * Get all active workflow tokens (for debugging)
   */
  getActiveTokens(): string[] {
    this.cleanupExpired();
    return Array.from(this.states.keys());
  }

  /**
   * Clear all states (for testing)
   */
  clear(): void {
    this.states.clear();
    logger.debug('Cleared all workflow states');
  }

  /**
   * Get count of active states
   */
  count(): number {
    this.cleanupExpired();
    return this.states.size;
  }
}

// Export singleton instance
export const workflowStateManager = new WorkflowStateManager();