/**
 * Types for MCP server connections
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Configuration for connecting to an MCP server
 */
export interface MCPServerConfig {
  name: string;
  transport: 'stdio';
  command: string;
  args: string[];
}

/**
 * Active MCP server connection
 */
export interface MCPConnection {
  config: MCPServerConfig;
  client: Client;
  connected: boolean;
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>;
}

/**
 * Result of validating MCP server requirements
 */
export interface MCPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  availableServers: string[];
  missingServers: string[];
  missingTools: Array<{
    server: string;
    tool: string;
  }>;
}
