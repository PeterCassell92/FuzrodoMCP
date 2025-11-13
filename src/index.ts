#!/usr/bin/env node

/**
 * FuzroDo MCP Server
 * General-purpose workflow orchestration server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { workflowRegistry } from './workflows/registry.js';
import { mcpClientManager } from './utils/mcpClient.js';
import { validateWorkflowRequirements, formatValidationResult } from './utils/requirements.js';
import { logger } from './utils/logger.js';
import { RequirementError } from './utils/errors.js';
import { workflowStateManager } from './utils/workflowState.js';

const server = new Server(
  {
    name: 'fuzrodo',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handle tool listing requests
 * Tools are dynamically generated from registered workflows
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Get tools from workflow registry
  const workflowTools = workflowRegistry.toMCPTools();

  // Add system tools
  const tools = [
    {
      name: 'hello_world',
      description: 'A simple test tool to verify FuzroDo is working',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name to greet',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'resume_workflow',
      description: 'Resume a paused workflow with results from an LLM task. Use this after completing the requested action from a partial workflow response.',
      inputSchema: {
        type: 'object',
        properties: {
          resumeToken: {
            type: 'string',
            description: 'Resume token from the partial workflow response',
          },
          results: {
            type: 'object',
            description: 'Results from executing the requested LLM action. Keys should match the requiredOutputs from the action.',
          },
        },
        required: ['resumeToken', 'results'],
      },
    },
    ...workflowTools,
  ];

  logger.debug(`Listing ${tools.length} tools (${workflowTools.length} workflows + 2 system tools)`);
  return { tools };
});

/**
 * Handle tool execution requests
 * Routes to appropriate workflow based on tool name
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Handle test tool
    if (name === 'hello_world') {
      const { name: userName } = args as { name: string };
      logger.info('hello_world tool called', { userName });

      // Get health status of MCP servers
      const health = await mcpClientManager.getHealthStatus();
      const configured = mcpClientManager.getConfiguredServers();

      let statusText = `Hello ${userName}! FuzroDo MCP server is running successfully.\n\n`;
      statusText += `Configured MCP servers: ${configured.length}\n`;

      if (health.length > 0) {
        statusText += '\nMCP Server Health:\n';
        for (const server of health) {
          const status = server.connected ? '✅' : '❌';
          const details = server.connected
            ? `${server.toolCount} tools available`
            : `Error: ${server.error}`;
          statusText += `  ${status} ${server.name}: ${details}\n`;
        }
      }

      statusText += `\nRegistered workflows: ${workflowRegistry.count()}`;

      return {
        content: [
          {
            type: 'text',
            text: statusText,
          },
        ],
      };
    }

    // Handle resume_workflow tool
    if (name === 'resume_workflow') {
      const { resumeToken, results } = args as { resumeToken: string; results: Record<string, any> };
      logger.info('resume_workflow tool called', { resumeToken });

      // Load saved workflow state
      const savedState = workflowStateManager.load(resumeToken);
      if (!savedState) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid or expired resume token: ${resumeToken}`
        );
      }

      // Get the workflow
      const workflowId = workflowStateManager.getWorkflowId(resumeToken);
      if (!workflowId) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Could not determine workflow from resume token'
        );
      }

      const workflow = workflowRegistry.get(workflowId);
      if (!workflow) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Workflow not found: ${workflowId}`
        );
      }

      logger.debug('Resuming workflow', {
        workflowId,
        results: Object.keys(results),
      });

      // Merge results into saved state
      const resumedState = {
        ...savedState,
        ...results,
        resuming: true,
      };

      // Create and execute the workflow graph
      const graph = workflow.createGraph();
      const result = await graph.invoke(resumedState);

      // Delete the saved state (workflow completed or will create new token)
      workflowStateManager.delete(resumeToken);

      logger.info('Workflow resumed', {
        workflowId,
        success: result.status === 'completed' && result.success,
      });

      // Format result for MCP response
      const responseText = formatWorkflowResult(workflow, result);

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    }

    // Check if this is a registered workflow
    const workflow = workflowRegistry.get(name);
    if (!workflow) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}. Available workflows: ${workflowRegistry.getIds().join(', ')}`
      );
    }

    logger.info(`Executing workflow: ${workflow.id}`, { name: workflow.name });

    // Validate workflow requirements
    logger.debug('Validating workflow requirements');
    const validation = await validateWorkflowRequirements(workflow, mcpClientManager);

    if (!validation.valid) {
      const errorMessage = formatValidationResult(validation);
      logger.error('Workflow requirements validation failed', { workflow: workflow.id });

      throw new RequirementError(
        `Workflow ${workflow.id} requirements not met:\n${errorMessage}`,
        validation.errors,
        workflow.id
      );
    }

    if (validation.warnings.length > 0) {
      logger.warn('Workflow has warnings', {
        workflow: workflow.id,
        warnings: validation.warnings
      });
    }

    // Create and execute the workflow graph
    logger.debug('Creating workflow graph');
    const graph = workflow.createGraph();

    logger.debug('Invoking workflow', { args });
    const result = await graph.invoke(args as any);

    logger.info('Workflow completed', {
      workflow: workflow.id,
      success: !result.error
    });

    // Format result for MCP response
    const responseText = formatWorkflowResult(workflow, result);

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    if (error instanceof RequirementError) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        error.message
      );
    }

    logger.error('Tool execution failed', {
      tool: name,
      error: error instanceof Error ? error.message : String(error)
    });

    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

/**
 * Format workflow execution result for display
 */
function formatWorkflowResult(workflow: any, result: any): string {
  const lines: string[] = [];

  lines.push(`Workflow: ${workflow.name} (${workflow.id})`);
  lines.push(`Version: ${workflow.version}`);
  lines.push('');

  // Handle partial workflow response (awaiting LLM action)
  if (result.status === 'awaiting_llm_action') {
    lines.push('⏸️  Workflow Paused - Action Required');
    lines.push('');

    if (result.completedSteps && result.completedSteps.length > 0) {
      lines.push('✓ Completed steps:');
      result.completedSteps.forEach((step: string) => lines.push(`  - ${step}`));
      lines.push('');
    }

    lines.push(`📋 Required Action: ${result.action.description}`);
    lines.push('');
    lines.push('Instructions:');
    lines.push(result.action.prompt);
    lines.push('');

    if (result.action.availableTools && result.action.availableTools.length > 0) {
      lines.push(`Available Tools: ${result.action.availableTools.join(', ')}`);
      lines.push('');
    }

    lines.push(`Required Outputs: ${result.action.requiredOutputs.join(', ')}`);
    lines.push('');
    lines.push(`Resume Token: ${result.resumeToken}`);
    lines.push('');
    lines.push('After completing the action, call resume_workflow with the resume token and results.');

    return lines.join('\n');
  }

  // Handle completed workflow
  if (result.error) {
    lines.push('❌ Workflow Failed');
    lines.push('');

    if (result.completedSteps && result.completedSteps.length > 0) {
      lines.push('✓ Completed steps:');
      result.completedSteps.forEach((step: string) => lines.push(`  - ${step}`));
      lines.push('');
    }

    if (result.failedStep) {
      lines.push(`✗ Failed at step: ${result.failedStep}`);
    }

    if (result.errors && result.errors.length > 0) {
      lines.push('');
      lines.push('Errors:');
      result.errors.forEach((err: any) =>
        lines.push(`  [${err.step}] ${err.error}`)
      );
    }

    lines.push('');
    lines.push(`Error: ${result.error}`);
  } else {
    lines.push('✅ Workflow Completed Successfully');
    lines.push('');

    if (result.completedSteps && result.completedSteps.length > 0) {
      lines.push('Completed steps:');
      result.completedSteps.forEach((step: string) => lines.push(`  ✓ ${step}`));
      lines.push('');
    }

    // Include relevant data from result
    if (result.data) {
      lines.push('Results:');
      if (result.data.ticketKey) {
        lines.push(`  Ticket: ${result.data.ticketKey}`);
      }
      if (result.data.ticketUrl) {
        lines.push(`  URL: ${result.data.ticketUrl}`);
      }
      if (result.data.audioId) {
        lines.push(`  Audio ID: ${result.data.audioId}`);
      }
      if (result.data.attachmentUrl) {
        lines.push(`  Attachment: ${result.data.attachmentUrl}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Start the MCP server
 */
async function main() {
  logger.info('Starting FuzroDo MCP server');
  logger.info(`Configured MCP servers: ${mcpClientManager.getConfiguredServers().join(', ') || 'none'}`);
  logger.info(`Registered workflows: ${workflowRegistry.count()}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('FuzroDo MCP server running on stdio');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down FuzroDo MCP server');
  await mcpClientManager.disconnectAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down FuzroDo MCP server');
  await mcpClientManager.disconnectAll();
  process.exit(0);
});

main().catch((error) => {
  logger.error('Fatal error in main()', { error });
  process.exit(1);
});
