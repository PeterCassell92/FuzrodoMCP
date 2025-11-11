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

  // Add hello_world test tool
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
    ...workflowTools,
  ];

  logger.debug(`Listing ${tools.length} tools (${workflowTools.length} workflows + 1 test tool)`);
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
      return {
        content: [
          {
            type: 'text',
            text: `Hello ${userName}! FuzroDo MCP server is running successfully.\n\nConfigured MCP servers: ${mcpClientManager.getConfiguredServers().join(', ') || 'none'}\nRegistered workflows: ${workflowRegistry.count()}`,
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
    if (result.ticketKey) {
      lines.push(`Ticket: ${result.ticketKey}`);
    }
    if (result.ticketUrl) {
      lines.push(`URL: ${result.ticketUrl}`);
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
