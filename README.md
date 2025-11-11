# FuzroDo

General-purpose workflow orchestration MCP server that coordinates complex multi-step processes across multiple MCP tools using LangGraph state machines.

## Overview

FuzroDo acts as both an MCP server and MCP client, allowing you to:
- Define workflows as composable LangGraph state machines
- Orchestrate multiple MCP servers in complex sequences
- Handle partial success and comprehensive error tracking
- Validate requirements before workflow execution

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd FusRohDoMCP

# Install dependencies
npm install

# Build the TypeScript code
npm run build
```

## Configuration

### 1. Configure FuzroDo

Copy `.env.example` to `.env` and configure the MCP servers that FuzroDo will orchestrate:

```bash
cp .env.example .env
```

Edit `.env` to point to your MCP servers:

```env
# ElevenLabs MCP Server
ELEVENLABS_MCP_TRANSPORT=stdio
ELEVENLABS_MCP_COMMAND=node
ELEVENLABS_MCP_ARGS=["c:/Users/peter/Documents/ElevenLabsMCP/dist/index.js"]

# Atlassian Prompts MCP Server
ATLASSIAN_MCP_TRANSPORT=stdio
ATLASSIAN_MCP_COMMAND=node
ATLASSIAN_MCP_ARGS=["c:/Users/peter/Documents/BitbucketPromptsForPlaywrightMCP/mcp-server/index.js"]

# Playwright MCP Server
PLAYWRIGHT_MCP_TRANSPORT=stdio
PLAYWRIGHT_MCP_COMMAND=npx
PLAYWRIGHT_MCP_ARGS=["-y", "@modelcontextprotocol/server-playwright"]

# Logging level
LOG_LEVEL=info
```

**Important**: Each MCP server manages its own secrets in its own `.env` file. FuzroDo only needs to know how to spawn them.

### 2. Configure Claude Code/Desktop

Add FuzroDo to your Claude Desktop configuration file.

**Location**:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Minimal Configuration** (just FuzroDo):

```json
{
  "mcpServers": {
    "fuzrodo": {
      "command": "node",
      "args": [
        "c:/Users/peter/Documents/FusRohDoMCP/dist/index.js"
      ],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Full Configuration** (FuzroDo + other MCP servers):

If you want Claude to access both FuzroDo workflows AND the individual MCP servers directly:

```json
{
  "mcpServers": {
    "fuzrodo": {
      "command": "node",
      "args": [
        "c:/Users/peter/Documents/FusRohDoMCP/dist/index.js"
      ],
      "env": {
        "LOG_LEVEL": "info"
      }
    },
    "elevenlabs": {
      "command": "node",
      "args": [
        "c:/Users/peter/Documents/ElevenLabsMCP/dist/index.js"
      ]
    },
    "atlassian-prompts": {
      "command": "node",
      "args": [
        "c:/Users/peter/Documents/BitbucketPromptsForPlaywrightMCP/mcp-server/index.js"
      ]
    },
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-playwright"
      ]
    }
  }
}
```

**Note**: Update paths to match your system.

### 3. Restart Claude Desktop

After updating the configuration, restart Claude Desktop to load the new MCP server.

## Usage

Once configured, FuzroDo workflows appear as tools in Claude:

```
Available tools:
- hello_world: Test tool to verify FuzroDo is working
- [your workflows will appear here once registered]
```

### Test the Installation

In Claude, you can test FuzroDo with:

```
Use the hello_world tool with name "Test"
```

This should respond with configured MCP servers and registered workflows.

## Development

### Project Structure

```
FuzroDo/
├── src/
│   ├── index.ts              # Main MCP server entry point
│   ├── workflows/            # Workflow definitions
│   │   └── registry.ts       # Workflow registry
│   ├── nodes/                # Reusable workflow nodes
│   ├── utils/
│   │   ├── mcpClient.ts     # MCP client manager
│   │   ├── logger.ts        # Logging utility
│   │   ├── errors.ts        # Custom error types
│   │   └── requirements.ts  # Requirement validation
│   └── types/
│       ├── workflow.ts       # Workflow type definitions
│       └── mcpConnections.ts # MCP connection types
└── dist/                     # Compiled JavaScript output
```

### Commands

```bash
# Development with auto-restart
npm run dev

# Build only
npm run build

# Watch mode (auto-rebuild)
npm run watch

# Run the server
npm start
```

### Creating Workflows

See [CLAUDE.md](CLAUDE.md) for detailed guidance on:
- Creating new workflows
- Adding workflow nodes
- Workflow state management
- Error handling patterns
- Testing workflows

## Architecture

FuzroDo uses a layered architecture:

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

### Key Principles

1. **General-purpose**: Not tied to specific workflows - extensible architecture
2. **Clear requirements**: Validate dependencies before execution
3. **Fail fast**: Don't hide errors, support partial success states
4. **Orchestration layer**: Coordinates other MCP servers, doesn't duplicate functionality

## License

MIT
