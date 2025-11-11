# FusRohDo Implementation Plan

## Overview
**FusRohDo** is a general-purpose workflow orchestration MCP server that coordinates complex multi-step processes across multiple MCP tools. It uses LangGraph for state machine management and acts as both an MCP server (exposing workflows) and MCP client (calling other MCP tools).

## Core Philosophy
- **General-purpose**: Not tied to specific workflows - extensible architecture
- **Clear requirements**: Validate dependencies before execution, fail with clear error messages
- **Fail fast**: Don't hide errors, but support partial success states
- **Orchestration layer**: Coordinates other MCP servers, doesn't duplicate their functionality

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code                         │
│                    (MCP Client)                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Calls workflow tools
                     ↓
┌─────────────────────────────────────────────────────────┐
│                   FusRohDo MCP Server                   │
│                (Workflow Orchestrator)                  │
│  ┌───────────────────────────────────────────────────┐ │
│  │         LangGraph State Machines                  │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  Jira Audio Quote Workflow                  │ │ │
│  │  │  (Create ticket → Enhance quote → Audio)    │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  Future Workflow #2                         │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │         MCP Client Manager                        │ │
│  │  (Connects to and calls other MCP servers)       │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────┬───────────────┬───────────────┬───────────┘
              │               │               │
              ↓               ↓               ↓
    ┌──────────────┐  ┌─────────────┐  ┌──────────────┐
    │ ElevenLabs   │  │  Atlassian  │  │  Playwright  │
    │     MCP      │  │     MCP     │  │     MCP      │
    └──────────────┘  └─────────────┘  └──────────────┘
```

## Project Structure

```
FusRohDo/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── implementationPlan.md (this file)
├── README.md
│
├── src/
│   ├── index.ts                    # Main MCP server entry point
│   │
│   ├── workflows/                  # Workflow definitions
│   │   ├── registry.ts             # Workflow registry and loader
│   │   └── jiraAudioQuote/
│   │       ├── workflow.ts         # LangGraph workflow definition
│   │       ├── state.ts            # Workflow state interface
│   │       └── config.ts           # Workflow configuration & requirements
│   │
│   ├── nodes/                      # Reusable workflow nodes
│   │   ├── jira/
│   │   │   ├── createTicket.ts
│   │   │   ├── extractQuote.ts
│   │   │   └── uploadAttachment.ts
│   │   ├── audio/
│   │   │   ├── enhanceQuote.ts
│   │   │   ├── generateAudio.ts
│   │   │   └── downloadAudio.ts
│   │   └── common/
│   │       ├── cleanup.ts
│   │       └── validation.ts
│   │
│   ├── utils/
│   │   ├── mcpClient.ts            # MCP client wrapper
│   │   ├── logger.ts               # Logging utility
│   │   ├── errors.ts               # Custom error types
│   │   └── requirements.ts         # Dependency validation
│   │
│   └── types/
│       ├── workflow.ts             # Common workflow types
│       └── mcpConnections.ts       # MCP connection types
│
└── dist/                           # Compiled JavaScript output
```

## Implementation Phases

### Phase 1: Foundation (Complete MCP Server Setup)
**Goal**: Create a working MCP server that can be called from Claude Code

#### Task 1.1: Core MCP Server
- [x] Create project structure
- [x] Set up package.json with dependencies
- [x] Configure TypeScript
- [ ] Implement basic MCP server in `src/index.ts`
- [ ] Add server metadata and capabilities
- [ ] Test server connection from Claude Code

#### Task 1.2: MCP Client Manager
**File**: `src/utils/mcpClient.ts`

Create a utility that:
- Connects to other MCP servers via stdio
- Maintains connection pool
- Provides typed interface for calling tools
- Handles connection errors gracefully
- Validates MCP server availability

```typescript
interface MCPConnection {
  name: string;
  transport: 'stdio';
  command: string;
  args: string[];
  client?: Client;
}

class MCPClientManager {
  async connect(serverName: string): Promise<Client>
  async callTool(serverName: string, toolName: string, args: any): Promise<any>
  async listTools(serverName: string): Promise<Tool[]>
  async disconnect(serverName: string): Promise<void>
  async validateRequirements(required: string[]): Promise<ValidationResult>
}
```

#### Task 1.3: Error Handling & Logging
**Files**: `src/utils/errors.ts`, `src/utils/logger.ts`

Custom error types:
- `WorkflowError`: Base error for workflow failures
- `RequirementError`: Missing MCP server or tool
- `NodeError`: Individual node execution failure
- `PartialSuccessError`: Workflow partially completed

### Phase 2: Workflow Infrastructure
**Goal**: Set up LangGraph workflow framework

#### Task 2.1: Workflow Types & Interfaces
**File**: `src/types/workflow.ts`

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  requirements: WorkflowRequirements;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  stateType: any;
  graph: StateGraph<any>;
}

interface WorkflowRequirements {
  mcpServers: {
    name: string;
    tools: string[];
    optional?: boolean;
  }[];
  environment?: string[];
}

interface WorkflowResult<T = any> {
  success: boolean;
  partialSuccess?: boolean;
  completedSteps: string[];
  failedStep?: string;
  data?: T;
  error?: Error;
}
```

#### Task 2.2: Workflow Registry
**File**: `src/workflows/registry.ts`

- Registry pattern for workflow discovery
- Dynamic workflow loading
- Validation of workflow definitions
- Export workflow metadata for MCP tool generation

```typescript
class WorkflowRegistry {
  register(workflow: WorkflowDefinition): void
  get(id: string): WorkflowDefinition | undefined
  list(): WorkflowDefinition[]
  validateAll(): ValidationResult[]
}
```

#### Task 2.3: Requirement Validation
**File**: `src/utils/requirements.ts`

Before executing workflow:
1. Check all required MCP servers are configured
2. Verify required tools exist on those servers
3. Validate environment variables
4. Return clear error messages if validation fails

```typescript
async function validateWorkflowRequirements(
  workflow: WorkflowDefinition,
  mcpManager: MCPClientManager
): Promise<ValidationResult> {
  // Check each required MCP server
  // List tools and verify they exist
  // Return detailed validation report
}
```

### Phase 3: Jira Audio Quote Workflow (First Workflow)
**Goal**: Implement the complete workflow from the original plan

#### Task 3.1: Workflow State Definition
**File**: `src/workflows/jiraAudioQuote/state.ts`

```typescript
interface JiraAudioQuoteState {
  // Input
  issueType: string;
  summary: string;
  description: string;
  priority?: string;
  additionalDetails?: string;
  audioStyle?: 'dramatic' | 'contemplative' | 'inspiring' | 'mystical';

  // Execution tracking
  currentStep: string;
  completedSteps: string[];

  // Jira ticket data
  ticketKey?: string;
  ticketUrl?: string;
  bradleyPlumQuote?: string;

  // Audio generation data
  enhancedQuote?: string;
  audioId?: string;
  audioFilePath?: string;

  // Upload data
  attachmentId?: string;
  attachmentUrl?: string;

  // Error handling
  error?: string;
  errors: Array<{ step: string; error: string }>;
}
```

#### Task 3.2: Workflow Configuration
**File**: `src/workflows/jiraAudioQuote/config.ts`

```typescript
export const jiraAudioQuoteWorkflowConfig: WorkflowRequirements = {
  mcpServers: [
    {
      name: 'atlassian-prompts',
      tools: ['generate_prompt'],
      optional: false
    },
    {
      name: 'elevenlabs',
      tools: ['enhance_quote_for_impact', 'create_wise_quote_audio', 'download_audio'],
      optional: false
    },
    {
      name: 'playwright',
      tools: ['browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot'],
      optional: false
    }
  ],
  environment: [
    'ELEVEN_LABS_API_KEY',
    'ATLASSIAN_USERNAME',
    'ATLASSIAN_API_KEY',
    'JIRA_URL'
  ]
};
```

#### Task 3.3: Implement Workflow Nodes

**Node 1: Create Jira Ticket** (`src/nodes/jira/createTicket.ts`)
```typescript
export async function createJiraTicketNode(
  state: JiraAudioQuoteState,
  mcpManager: MCPClientManager
): Promise<Partial<JiraAudioQuoteState>> {
  try {
    // 1. Call atlassian-prompts MCP to generate prompt
    const prompt = await mcpManager.callTool('atlassian-prompts', 'generate_prompt', {
      template: 'jira-create-issue',
      substitutions: {
        issueType: state.issueType,
        summary: state.summary,
        description: state.description,
        priority: state.priority,
        additionalDetails: state.additionalDetails
      }
    });

    // 2. Use Playwright to execute ticket creation
    // ... browser automation logic ...

    // 3. Extract ticket key and URL from result
    return {
      ticketKey: extractedKey,
      ticketUrl: extractedUrl,
      currentStep: 'extractQuote',
      completedSteps: [...state.completedSteps, 'createTicket']
    };
  } catch (error) {
    return {
      error: `Failed to create Jira ticket: ${error.message}`,
      errors: [...state.errors, { step: 'createTicket', error: error.message }],
      currentStep: 'failed'
    };
  }
}
```

**Node 2: Extract Quote** (`src/nodes/jira/extractQuote.ts`)
- Parse ticket description
- Find Bradley Plum quote (typically in blockquote)
- Validate quote format
- Handle missing quote gracefully

**Node 3: Enhance Quote** (`src/nodes/audio/enhanceQuote.ts`)
```typescript
export async function enhanceQuoteNode(
  state: JiraAudioQuoteState,
  mcpManager: MCPClientManager
): Promise<Partial<JiraAudioQuoteState>> {
  try {
    const result = await mcpManager.callTool('elevenlabs', 'enhance_quote_for_impact', {
      quote: state.bradleyPlumQuote,
      style: state.audioStyle || 'mystical'
    });

    return {
      enhancedQuote: result.enhancedQuote,
      currentStep: 'generateAudio',
      completedSteps: [...state.completedSteps, 'enhanceQuote']
    };
  } catch (error) {
    // Fallback: use original quote if enhancement fails
    return {
      enhancedQuote: state.bradleyPlumQuote,
      currentStep: 'generateAudio',
      completedSteps: [...state.completedSteps, 'enhanceQuote'],
      errors: [...state.errors, { step: 'enhanceQuote', error: `Enhancement failed, using original: ${error.message}` }]
    };
  }
}
```

**Node 4: Generate Audio** (`src/nodes/audio/generateAudio.ts`)
- Call `create_wise_quote_audio` from ElevenLabs MCP
- Store audio ID in state
- Handle API failures with retry logic

**Node 5: Download Audio** (`src/nodes/audio/downloadAudio.ts`)
- Call `download_audio` with audio ID
- Save to temporary directory with unique filename
- Store file path in state

**Node 6: Upload to Jira** (`src/nodes/jira/uploadAttachment.ts`)
- Use Playwright to navigate to ticket
- Upload audio file as attachment
- Verify upload success
- Store attachment ID and URL

**Node 7: Cleanup** (`src/nodes/common/cleanup.ts`)
- Delete temporary audio file
- Clear any cached data
- Return final workflow result

#### Task 3.4: Build LangGraph State Machine
**File**: `src/workflows/jiraAudioQuote/workflow.ts`

```typescript
import { StateGraph, END } from "@langchain/langgraph";

export function createJiraAudioQuoteWorkflow(mcpManager: MCPClientManager) {
  const workflow = new StateGraph<JiraAudioQuoteState>({
    channels: {
      issueType: { value: null },
      summary: { value: null },
      description: { value: null },
      priority: { value: null },
      additionalDetails: { value: null },
      audioStyle: { value: null },
      currentStep: { value: 'createTicket' },
      completedSteps: { value: [] },
      ticketKey: { value: null },
      ticketUrl: { value: null },
      bradleyPlumQuote: { value: null },
      enhancedQuote: { value: null },
      audioId: { value: null },
      audioFilePath: { value: null },
      attachmentId: { value: null },
      attachmentUrl: { value: null },
      error: { value: null },
      errors: { value: [] }
    }
  });

  // Add nodes
  workflow.addNode("createTicket", (state) => createJiraTicketNode(state, mcpManager));
  workflow.addNode("extractQuote", (state) => extractQuoteNode(state, mcpManager));
  workflow.addNode("enhanceQuote", (state) => enhanceQuoteNode(state, mcpManager));
  workflow.addNode("generateAudio", (state) => generateAudioNode(state, mcpManager));
  workflow.addNode("downloadAudio", (state) => downloadAudioNode(state, mcpManager));
  workflow.addNode("uploadToJira", (state) => uploadToJiraNode(state, mcpManager));
  workflow.addNode("cleanup", (state) => cleanupNode(state, mcpManager));

  // Define conditional edges for error handling
  workflow.addConditionalEdges("createTicket", (state) => {
    if (state.error) return "cleanup"; // Fail fast - can't continue without ticket
    return "extractQuote";
  });

  workflow.addConditionalEdges("extractQuote", (state) => {
    if (state.error) return "cleanup"; // Fail fast - can't continue without quote
    return "enhanceQuote";
  });

  // After enhanceQuote, continue even if enhancement failed (fallback to original)
  workflow.addEdge("enhanceQuote", "generateAudio");

  workflow.addConditionalEdges("generateAudio", (state) => {
    if (state.error) return "cleanup"; // Partial success: ticket created but no audio
    return "downloadAudio";
  });

  workflow.addConditionalEdges("downloadAudio", (state) => {
    if (state.error) return "cleanup"; // Partial success: audio generated but not downloaded
    return "uploadToJira";
  });

  // After uploadToJira, always cleanup (success or failure)
  workflow.addEdge("uploadToJira", "cleanup");
  workflow.addEdge("cleanup", END);

  // Set entry point
  workflow.setEntryPoint("createTicket");

  return workflow.compile();
}
```

### Phase 4: MCP Tool Exposure
**Goal**: Expose workflows as callable MCP tools

#### Task 4.1: Dynamic Tool Generation
**File**: `src/index.ts`

For each registered workflow, automatically generate an MCP tool:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: 'fusrohdo',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register all workflows
const registry = new WorkflowRegistry();
registry.register(jiraAudioQuoteWorkflow);

// Generate MCP tools from workflows
const tools = registry.list().map(workflow => ({
  name: workflow.id,
  description: workflow.description,
  inputSchema: workflow.inputSchema
}));

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const workflow = registry.get(request.params.name);

  if (!workflow) {
    throw new Error(`Workflow not found: ${request.params.name}`);
  }

  // Validate requirements
  const validation = await validateWorkflowRequirements(workflow, mcpManager);
  if (!validation.valid) {
    throw new RequirementError(validation.errors);
  }

  // Execute workflow
  const result = await workflow.graph.invoke(request.params.arguments);

  // Return result with partial success indication
  return {
    success: !result.error,
    partialSuccess: result.completedSteps.length > 0 && result.error,
    completedSteps: result.completedSteps,
    data: result,
    error: result.error
  };
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Task 4.2: Result Formatting
Create structured response format:

```typescript
interface WorkflowResponse {
  success: boolean;
  partialSuccess?: boolean;
  workflow: string;
  completedSteps: string[];
  failedStep?: string;
  data: {
    ticketKey?: string;
    ticketUrl?: string;
    attachmentUrl?: string;
    // ... other workflow-specific data
  };
  errors: Array<{
    step: string;
    error: string;
  }>;
  message: string; // Human-readable summary
}
```

### Phase 5: Testing & Validation
**Goal**: Ensure reliability and proper error handling

#### Task 5.1: Unit Tests
- Test individual workflow nodes
- Test MCP client manager
- Test requirement validation
- Test error handling

#### Task 5.2: Integration Tests
- Test complete workflow end-to-end
- Test with real MCP servers (ElevenLabs, Atlassian, Playwright)
- Test partial success scenarios
- Test missing dependency handling

#### Task 5.3: Error Scenarios
Test cases:
1. Missing MCP server (atlassian-prompts not configured)
2. Missing tool on MCP server (enhance_quote_for_impact doesn't exist)
3. Network timeout during audio generation
4. Jira ticket creation succeeds but audio fails
5. Audio generation succeeds but upload fails
6. Missing environment variables

### Phase 6: Documentation
**Goal**: Comprehensive documentation for users and developers

#### Task 6.1: README.md
- Project overview and philosophy
- Installation instructions
- Quick start guide
- Configuration guide
- Usage examples
- Troubleshooting

#### Task 6.2: Workflow Documentation
For each workflow, document:
- Purpose and use case
- Required MCP servers and tools
- Input parameters
- Output format
- Partial success states
- Error scenarios

#### Task 6.3: Developer Guide
- How to create new workflows
- How to add new nodes
- How to register workflows
- Testing guidelines
- Best practices

## Success Criteria

### Phase 1 Success
- [x] FusRohDo project created with proper structure
- [ ] MCP server starts without errors
- [ ] Can connect from Claude Code
- [ ] MCP client manager can connect to other MCP servers
- [ ] Requirement validation works

### Phase 2 Success
- [ ] Workflow registry manages workflow definitions
- [ ] Can dynamically generate MCP tools from workflows
- [ ] Clear error messages for missing requirements

### Phase 3 Success
- [ ] Jira Audio Quote workflow executes end-to-end
- [ ] Jira ticket is created successfully
- [ ] Bradley Plum quote is enhanced and converted to audio
- [ ] Audio file is attached to Jira ticket
- [ ] Partial success handling works (ticket created even if audio fails)
- [ ] Cleanup removes temporary files

### Phase 4 Success
- [ ] Workflow is callable as MCP tool from Claude Code
- [ ] Tool returns structured result with success/failure status
- [ ] Partial success states are clearly indicated
- [ ] Errors are descriptive and actionable

### Final Success
- [ ] Complete end-to-end workflow works from Claude Code
- [ ] All error scenarios handled gracefully
- [ ] Documentation is complete and clear
- [ ] Project is ready for additional workflows

## Future Workflows (Ideas)

1. **Code Review Workflow**
   - PR created → Run linter → Run tests → Generate AI review → Post comment

2. **Documentation Generator**
   - Code changed → Extract functions → Generate docs → Update README → Commit

3. **Bug Triage Workflow**
   - Issue created → Analyze code → Find similar issues → Suggest labels → Assign

4. **Release Automation**
   - Tag created → Run tests → Build artifacts → Generate changelog → Create release

## Dependencies Between Phases

```
Phase 1 (Foundation)
    ↓
Phase 2 (Workflow Infrastructure) ← Must complete Phase 1
    ↓
Phase 3 (First Workflow) ← Must complete Phase 1 & 2
    ↓
Phase 4 (MCP Tool Exposure) ← Must complete Phase 1, 2, & 3
    ↓
Phase 5 (Testing) ← Can start after Phase 3
    ↓
Phase 6 (Documentation) ← Can start after Phase 3

```

## Implementation Timeline

**Total Time: 2 days (16 hours in 2-hour bursts)**

### Day 1: Foundation & Infrastructure
- **Hours 0-2**: Phase 1 - Core MCP server and client manager
- **Hours 2-4**: Phase 2 - Workflow infrastructure and registry
- **Hours 4-6**: Phase 3.1-3.2 - Workflow state and config
- **Hours 6-8**: Phase 3.3 - Implement first 3-4 workflow nodes

### Day 2: Workflow Completion & Polish
- **Hours 8-10**: Phase 3.3 - Complete remaining workflow nodes
- **Hours 10-12**: Phase 3.4 & Phase 4 - LangGraph state machine and MCP exposure
- **Hours 12-14**: Phase 5 - Integration testing and error handling
- **Hours 14-16**: Phase 6 - Documentation and final polish

## Next Steps

1. Complete Phase 1, Task 1.1 - Implement basic MCP server in `src/index.ts`
2. Complete Phase 1, Task 1.2 - Implement MCP client manager
3. Complete Phase 1, Task 1.3 - Error handling and logging utilities
4. Test Phase 1 by connecting from Claude Code

Ready to start implementation!
