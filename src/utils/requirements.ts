/**
 * Workflow requirement validation utilities
 */

import { WorkflowDefinition } from '../types/workflow';
import { MCPClientManager } from './mcpClient';
import { MCPValidationResult } from '../types/mcpConnections';
import { logger } from './logger';

/**
 * Validate all requirements for a workflow
 */
export async function validateWorkflowRequirements(
  workflow: WorkflowDefinition,
  mcpManager: MCPClientManager
): Promise<MCPValidationResult> {
  logger.info(`Validating requirements for workflow: ${workflow.id}`);

  // Validate MCP server requirements
  const mcpValidation = await mcpManager.validateRequirements(
    workflow.requirements.mcpServers
  );

  // Validate environment variables
  const envErrors: string[] = [];
  const envWarnings: string[] = [];

  if (workflow.requirements.environment) {
    for (const envVar of workflow.requirements.environment) {
      if (!process.env[envVar]) {
        envErrors.push(`Required environment variable not set: ${envVar}`);
      }
    }
  }

  // Combine results
  const result: MCPValidationResult = {
    valid: mcpValidation.valid && envErrors.length === 0,
    errors: [...mcpValidation.errors, ...envErrors],
    warnings: [...mcpValidation.warnings, ...envWarnings],
    availableServers: mcpValidation.availableServers,
    missingServers: mcpValidation.missingServers,
    missingTools: mcpValidation.missingTools,
  };

  if (!result.valid) {
    logger.error(`Workflow ${workflow.id} validation failed`, {
      errors: result.errors,
    });
  } else if (result.warnings.length > 0) {
    logger.warn(`Workflow ${workflow.id} has warnings`, {
      warnings: result.warnings,
    });
  } else {
    logger.info(`Workflow ${workflow.id} validation passed`);
  }

  return result;
}

/**
 * Format validation result as a human-readable message
 */
export function formatValidationResult(result: MCPValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✓ All requirements validated successfully');

    if (result.warnings.length > 0) {
      lines.push('\nWarnings:');
      result.warnings.forEach(warning => lines.push(`  ⚠ ${warning}`));
    }
  } else {
    lines.push('✗ Validation failed\n');
    lines.push('Errors:');
    result.errors.forEach(error => lines.push(`  ✗ ${error}`));

    if (result.warnings.length > 0) {
      lines.push('\nWarnings:');
      result.warnings.forEach(warning => lines.push(`  ⚠ ${warning}`));
    }
  }

  if (result.availableServers.length > 0) {
    lines.push(`\nAvailable MCP servers: ${result.availableServers.join(', ')}`);
  }

  if (result.missingServers.length > 0) {
    lines.push(`\nMissing MCP servers: ${result.missingServers.join(', ')}`);
  }

  if (result.missingTools.length > 0) {
    lines.push('\nMissing tools:');
    result.missingTools.forEach(({ server, tool }) =>
      lines.push(`  - ${tool} on ${server}`)
    );
  }

  return lines.join('\n');
}
