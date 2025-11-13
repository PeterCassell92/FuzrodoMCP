# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FuzroDo** is a general-purpose workflow orchestration MCP (Model Context Protocol) server that coordinates complex multi-step processes across multiple MCP tools. It uses LangGraph for state machine management and operates as both an MCP server (exposing workflows as callable tools) and an MCP client (orchestrating calls to other MCP servers).

## Core Architecture

FuzroDo follows a layered architecture:

```
Claude Code (MCP Client)
    ↓ calls workflow tools
FuzroDo MCP Server (Workflow Orchestrator)
    ├── LangGraph State Machines (workflow execution)
    ├── Workflow Registry (manages workflow definitions)
    └── MCP Client Manager (connects to other MCP servers)
        ↓ orchestrates
    External MCP Servers (ElevenLabs, Atlassian, Playwright, etc.)
```

**Key principle**: FuzroDo is an orchestration layer that coordinates other MCP servers, not duplicate their functionality.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Build and run (development)
npm run dev

# Run compiled server
npm start

# Watch mode (auto-rebuild on changes)
npm run watch
```

## Architecture Principles

### General-Purpose Design
- Not tied to specific workflows - extensible architecture
- New workflows can be added without modifying core infrastructure
- Workflow registry pattern for dynamic workflow discovery

### Clear Requirements Validation
- Each workflow declares its required MCP servers and tools
- Validates dependencies before execution
- Fails with clear error messages if requirements are not met
- Check environment variables needed per workflow

### Fail Fast with Partial Success
- Don't hide errors - surface them immediately
- Support partial success states (e.g., Jira ticket created but audio generation failed)
- Track completed steps vs failed steps
- Cleanup temporary resources even on failure

### Dual MCP Role
- **As MCP Server**: Exposes workflows as callable tools to Claude Code
- **As MCP Client**: Connects to and orchestrates other MCP servers

## Project Structure

```
src/
├── index.ts                      # Main MCP server entry point
├── workflows/                    # Workflow definitions
│   ├── registry.ts              # Workflow registry and loader
│   └── jiraAudioQuote/          # Example workflow
│       ├── workflow.ts          # LangGraph state machine definition
│       ├── state.ts             # Workflow state interface
│       └── config.ts            # Workflow requirements & configuration
├── nodes/                       # Reusable workflow nodes
│   ├── jira/                   # Jira-specific nodes
│   ├── audio/                  # Audio generation nodes
│   └── common/                 # Common nodes (validation, cleanup)
├── utils/
│   ├── mcpClient.ts            # MCP client wrapper for connecting to other servers
│   ├── logger.ts               # Logging utility
│   ├── errors.ts               # Custom error types
│   └── requirements.ts         # Dependency validation logic
└── types/
    ├── workflow.ts             # Common workflow type definitions
    └── mcpConnections.ts       # MCP connection type definitions
```

## Workflow Architecture

Each workflow consists of:

1. **State Definition** (`state.ts`): TypeScript interface defining workflow state
   - Input parameters
   - Execution tracking (currentStep, completedSteps)
   - Intermediate data (e.g., ticketKey, audioId)
   - Error tracking

2. **Configuration** (`config.ts`): Workflow requirements
   - Required MCP servers and their tools
   - Required environment variables
   - Optional vs required dependencies

3. **Workflow Definition** (`workflow.ts`): LangGraph state machine
   - Node definitions (individual steps)
   - Edge definitions (flow control)
   - Conditional edges for error handling
   - Entry and exit points

4. **Nodes** (in `src/nodes/`): Reusable workflow steps
   - Each node is a pure function: `(state, mcpManager) => Partial<State>`
   - Nodes update state and handle errors
   - Nodes call other MCP servers via mcpManager

## MCP Client Manager

The `mcpClient.ts` utility manages connections to external MCP servers:

```typescript
class MCPClientManager {
  async connect(serverName: string): Promise<Client>
  async callTool(serverName: string, toolName: string, args: any): Promise<any>
  async listTools(serverName: string): Promise<Tool[]>
  async disconnect(serverName: string): Promise<void>
  async validateRequirements(required: string[]): Promise<ValidationResult>
}
```

Configuration is read from `.env` file with pattern:
- `{SERVERNAME}_MCP_TRANSPORT`
- `{SERVERNAME}_MCP_COMMAND`
- `{SERVERNAME}_MCP_ARGS` (JSON array)

**Important**: Only configure MCPs that FuzroDo directly calls (ElevenLabs, Atlassian-Prompts). MCPs that Claude uses based on workflow instructions (Playwright) should NOT be configured in FuzroDo's `.env`.

## Error Handling

Custom error types in `src/utils/errors.ts`:
- `WorkflowError`: Base error for workflow failures
- `RequirementError`: Missing MCP server or tool
- `NodeError`: Individual node execution failure
- `PartialSuccessError`: Workflow partially completed

Workflow results include:
```typescript
interface WorkflowResult {
  success: boolean;
  partialSuccess?: boolean;
  completedSteps: string[];
  failedStep?: string;
  data?: any;
  error?: Error;
}
```

## Adding New Workflows

1. Create workflow directory in `src/workflows/{workflowName}/`
2. Define state interface in `state.ts`
3. Define requirements in `config.ts`
4. Implement nodes in `src/nodes/{category}/`
5. Build LangGraph state machine in `workflow.ts`
6. Register workflow in `src/workflows/registry.ts`
7. Workflow automatically exposed as MCP tool

## Reference Implementation: Jira Audio Quote Workflow

The primary example workflow demonstrates the orchestration pattern:

**Flow**: Create Jira Ticket → Extract Quote → Enhance Quote → Generate Audio → Download Audio → Upload to Jira → Cleanup

**MCP Servers Used**:
- `atlassian-prompts`: Generate Jira ticket creation prompts
- `playwright`: Browser automation for Jira interaction
- `elevenlabs`: Text-to-speech audio generation

**Partial Success Handling**: If audio generation fails, Jira ticket is still created (partial success). Track completed steps vs failed steps.

## Environment Configuration

Copy `.env.example` to `.env` and configure MCP server connections. Each external MCP server needs:
```
{SERVERNAME}_MCP_TRANSPORT=stdio
{SERVERNAME}_MCP_COMMAND=node|npx
{SERVERNAME}_MCP_ARGS=["path/to/server.js"]
```

## State Management with LangGraph

- Use `StateGraph` from `@langchain/langgraph`
- Define channels for each state property
- Nodes return partial state updates (merged automatically)
- Use conditional edges for error handling and branching
- Always set entry point and connect to END
