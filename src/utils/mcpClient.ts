/**
 * MCP Client Manager
 * Manages connections to external MCP servers and provides
 * a clean interface for calling their tools
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  MCPServerConfig,
  MCPConnection,
  MCPValidationResult
} from '../types/mcpConnections.js';
import { MCPClientError } from './errors.js';
import { logger } from './logger.js';

export class MCPClientManager {
  private connections: Map<string, MCPConnection> = new Map();
  private config: Map<string, MCPServerConfig> = new Map();

  constructor() {
    this.loadConfigFromEnv();
  }

  /**
   * Load MCP server configurations from environment variables
   * Format: {SERVERNAME}_MCP_TRANSPORT, {SERVERNAME}_MCP_COMMAND, {SERVERNAME}_MCP_ARGS
   */
  private loadConfigFromEnv(): void {
    const serverNames = new Set<string>();

    // Find all MCP server configurations in environment
    for (const key of Object.keys(process.env)) {
      const match = key.match(/^(.+)_MCP_TRANSPORT$/);
      if (match) {
        serverNames.add(match[1]);
      }
    }

    // Parse configuration for each server
    for (const serverName of serverNames) {
      const transport = process.env[`${serverName}_MCP_TRANSPORT`];
      const command = process.env[`${serverName}_MCP_COMMAND`];
      const argsStr = process.env[`${serverName}_MCP_ARGS`];

      if (transport === 'stdio' && command && argsStr) {
        try {
          const args = JSON.parse(argsStr);
          const normalizedName = serverName.toLowerCase().replace(/_/g, '-');

          this.config.set(normalizedName, {
            name: normalizedName,
            transport: 'stdio',
            command,
            args,
          });

          logger.debug(`Loaded MCP server config: ${normalizedName}`);
        } catch (error) {
          logger.warn(`Failed to parse MCP config for ${serverName}`, { error });
        }
      }
    }

    logger.info(`Loaded ${this.config.size} MCP server configurations`);
  }

  /**
   * Connect to an MCP server
   */
  async connect(serverName: string): Promise<Client> {
    // Check if already connected
    const existing = this.connections.get(serverName);
    if (existing?.connected) {
      return existing.client;
    }

    // Get configuration
    const config = this.config.get(serverName);
    if (!config) {
      throw new MCPClientError(
        `No configuration found for MCP server: ${serverName}`,
        serverName
      );
    }

    try {
      logger.info(`Connecting to MCP server: ${serverName}`);

      // Create client and transport
      const client = new Client(
        {
          name: `fuzrodo-client-${serverName}`,
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
      });

      await client.connect(transport);

      // Store connection
      const connection: MCPConnection = {
        config,
        client,
        connected: true,
      };

      this.connections.set(serverName, connection);
      logger.info(`Successfully connected to MCP server: ${serverName}`);

      return client;
    } catch (error) {
      throw new MCPClientError(
        `Failed to connect to MCP server: ${serverName}`,
        serverName,
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * List available tools on an MCP server
   */
  async listTools(serverName: string): Promise<Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>> {
    const client = await this.connect(serverName);

    try {
      const response = await client.listTools();

      // Cache tools on connection
      const connection = this.connections.get(serverName);
      if (connection) {
        connection.tools = response.tools;
      }

      return response.tools;
    } catch (error) {
      throw new MCPClientError(
        `Failed to list tools for MCP server: ${serverName}`,
        serverName,
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<any> {
    const client = await this.connect(serverName);

    try {
      logger.debug(`Calling tool ${toolName} on ${serverName}`, { args });

      const response = await client.callTool({
        name: toolName,
        arguments: args,
      });

      logger.debug(`Tool ${toolName} completed successfully`);
      return response;
    } catch (error) {
      throw new MCPClientError(
        `Failed to call tool ${toolName} on ${serverName}`,
        serverName,
        toolName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Validate that required MCP servers and tools are available
   */
  async validateRequirements(
    requirements: Array<{
      name: string;
      tools: string[];
      optional?: boolean;
    }>
  ): Promise<MCPValidationResult> {
    const result: MCPValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      availableServers: [],
      missingServers: [],
      missingTools: [],
    };

    for (const requirement of requirements) {
      const { name, tools, optional } = requirement;

      // Check if server is configured
      if (!this.config.has(name)) {
        if (optional) {
          result.warnings.push(`Optional MCP server not configured: ${name}`);
        } else {
          result.valid = false;
          result.errors.push(`Required MCP server not configured: ${name}`);
          result.missingServers.push(name);
        }
        continue;
      }

      // Try to connect and list tools
      try {
        const availableTools = await this.listTools(name);
        const availableToolNames = new Set(availableTools.map(t => t.name));

        result.availableServers.push(name);

        // Check each required tool
        for (const tool of tools) {
          if (!availableToolNames.has(tool)) {
            if (optional) {
              result.warnings.push(`Optional tool ${tool} not found on ${name}`);
            } else {
              result.valid = false;
              result.errors.push(`Required tool ${tool} not found on ${name}`);
              result.missingTools.push({ server: name, tool });
            }
          }
        }
      } catch (error) {
        if (optional) {
          result.warnings.push(`Failed to connect to optional MCP server: ${name}`);
        } else {
          result.valid = false;
          result.errors.push(`Failed to connect to required MCP server: ${name}`);
          result.missingServers.push(name);
        }
      }
    }

    return result;
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (connection?.connected) {
      try {
        await connection.client.close();
        connection.connected = false;
        logger.info(`Disconnected from MCP server: ${serverName}`);
      } catch (error) {
        logger.warn(`Error disconnecting from ${serverName}`, { error });
      }
    }
  }

  /**
   * Disconnect from all MCP servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map(
      serverName => this.disconnect(serverName)
    );
    await Promise.all(disconnectPromises);
  }

  /**
   * Get list of configured servers
   */
  getConfiguredServers(): string[] {
    return Array.from(this.config.keys());
  }

  /**
   * Check if a server is configured
   */
  hasServer(serverName: string): boolean {
    return this.config.has(serverName);
  }
}

// Export singleton instance
export const mcpClientManager = new MCPClientManager();
