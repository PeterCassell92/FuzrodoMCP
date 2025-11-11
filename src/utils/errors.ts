/**
 * Custom error types for FuzroDo workflows
 */

/**
 * Base error class for all workflow-related errors
 */
export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly workflowId?: string,
    public readonly step?: string
  ) {
    super(message);
    this.name = 'WorkflowError';
    Object.setPrototypeOf(this, WorkflowError.prototype);
  }
}

/**
 * Error thrown when workflow requirements are not met
 */
export class RequirementError extends WorkflowError {
  constructor(
    message: string,
    public readonly missingRequirements: string[],
    workflowId?: string
  ) {
    super(message, workflowId);
    this.name = 'RequirementError';
    Object.setPrototypeOf(this, RequirementError.prototype);
  }
}

/**
 * Error thrown when an individual workflow node fails
 */
export class NodeError extends WorkflowError {
  constructor(
    message: string,
    step: string,
    public readonly cause?: Error,
    workflowId?: string
  ) {
    super(message, workflowId, step);
    this.name = 'NodeError';
    Object.setPrototypeOf(this, NodeError.prototype);
  }
}

/**
 * Error indicating workflow partially completed
 */
export class PartialSuccessError extends WorkflowError {
  constructor(
    message: string,
    public readonly completedSteps: string[],
    public readonly failedStep: string,
    public readonly data?: any,
    workflowId?: string
  ) {
    super(message, workflowId, failedStep);
    this.name = 'PartialSuccessError';
    Object.setPrototypeOf(this, PartialSuccessError.prototype);
  }
}

/**
 * Error thrown when MCP client operations fail
 */
export class MCPClientError extends Error {
  constructor(
    message: string,
    public readonly serverName?: string,
    public readonly toolName?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MCPClientError';
    Object.setPrototypeOf(this, MCPClientError.prototype);
  }
}
