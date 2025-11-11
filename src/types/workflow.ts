/**
 * Core workflow type definitions
 */

import type { CompiledStateGraph } from '@langchain/langgraph';

/**
 * JSON Schema type for tool inputs/outputs
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: any;
}

/**
 * Requirements for a workflow to execute
 */
export interface WorkflowRequirements {
  mcpServers: Array<{
    name: string;
    tools: string[];
    optional?: boolean;
  }>;
  environment?: string[];
}

/**
 * Complete workflow definition
 * TState: The workflow state type
 * TUpdate: The partial state update type (defaults to Partial<TState>)
 */
export interface WorkflowDefinition<TState = any, TUpdate = Partial<TState>> {
  id: string;
  name: string;
  description: string;
  version: string;
  requirements: WorkflowRequirements;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  createGraph: () => CompiledStateGraph<TState, TUpdate>;
}

/**
 * Result of workflow execution
 */
export interface WorkflowResult<T = any> {
  success: boolean;
  partialSuccess?: boolean;
  completedSteps: string[];
  failedStep?: string;
  data?: T;
  error?: string;
  errors?: Array<{
    step: string;
    error: string;
  }>;
}

/**
 * Base interface for workflow state
 * All workflow states should extend this
 */
export interface BaseWorkflowState {
  currentStep: string;
  completedSteps: string[];
  error?: string;
  errors: Array<{
    step: string;
    error: string;
  }>;
}
