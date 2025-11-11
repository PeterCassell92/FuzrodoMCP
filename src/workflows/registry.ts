/**
 * Workflow Registry
 * Manages registration and discovery of workflows
 */

import { WorkflowDefinition } from '../types/workflow.js';
import { logger } from '../utils/logger.js';

export class WorkflowRegistry {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  /**
   * Register a workflow
   */
  register(workflow: WorkflowDefinition): void {
    if (this.workflows.has(workflow.id)) {
      logger.warn(`Workflow ${workflow.id} is already registered, overwriting`);
    }

    this.workflows.set(workflow.id, workflow);
    logger.info(`Registered workflow: ${workflow.id} (${workflow.name})`);
  }

  /**
   * Register multiple workflows
   */
  registerMany(workflows: WorkflowDefinition[]): void {
    for (const workflow of workflows) {
      this.register(workflow);
    }
  }

  /**
   * Get a workflow by ID
   */
  get(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  /**
   * Check if a workflow exists
   */
  has(id: string): boolean {
    return this.workflows.has(id);
  }

  /**
   * List all registered workflows
   */
  list(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get workflow IDs
   */
  getIds(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * Unregister a workflow
   */
  unregister(id: string): boolean {
    const deleted = this.workflows.delete(id);
    if (deleted) {
      logger.info(`Unregistered workflow: ${id}`);
    }
    return deleted;
  }

  /**
   * Clear all workflows
   */
  clear(): void {
    this.workflows.clear();
    logger.info('Cleared all workflows from registry');
  }

  /**
   * Get count of registered workflows
   */
  count(): number {
    return this.workflows.size;
  }

  /**
   * Convert workflows to MCP tool definitions
   */
  toMCPTools(): Array<{
    name: string;
    description: string;
    inputSchema: any;
  }> {
    return this.list().map(workflow => ({
      name: workflow.id,
      description: `${workflow.name} - ${workflow.description}`,
      inputSchema: workflow.inputSchema,
    }));
  }
}

// Export singleton instance
export const workflowRegistry = new WorkflowRegistry();
