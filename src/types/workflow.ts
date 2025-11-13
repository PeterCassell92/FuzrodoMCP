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
 * Action requested from LLM/Claude Code
 */
export interface LLMAction {
  type: 'browser_automation' | 'text_processing' | 'decision' | 'custom';
  description: string;
  prompt: string;
  requiredOutputs: string[];
  availableTools?: string[]; // MCP tool names to use
  context?: Record<string, any>; // Additional context for the action
}

/**
 * Partial workflow response (awaiting LLM action)
 */
export interface PartialWorkflowResult {
  status: 'awaiting_llm_action';
  workflowId: string;
  resumeToken: string;
  completedSteps: string[];
  action: LLMAction;
  message: string; // Human-readable description
}

/**
 * Completed workflow response
 */
export interface CompletedWorkflowResult<T = any> {
  status: 'completed';
  success: boolean;
  workflowId: string;
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
 * Result of workflow execution (union type)
 */
export type WorkflowResult<T = any> =
  | PartialWorkflowResult
  | CompletedWorkflowResult<T>;

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
