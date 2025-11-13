# Stateless Augmentation MCP Pattern

## Overview

The **Stateless Augmentation MCP** pattern (also called "Human-in-the-Loop MCP") enables MCP servers to orchestrate complex workflows that require LLM reasoning, without the MCP server itself having LLM capabilities or maintaining context.

## Core Concept

**MCP servers should augment Claude, not replace it.**

Instead of MCP servers spinning up their own LLM instances, they delegate LLM-required tasks back to the Claude instance that called them, which already has full context and reasoning capabilities.

## Architecture

```
┌─────────────────────────────────────────────────┐
│         User Conversation                       │
│              ↓                                   │
│         Claude Code Instance                    │
│    (Has full context, user history, etc.)      │
└──────────────┬──────────────────────────────────┘
               │
               │ 1. Call workflow tool
               ↓
┌──────────────────────────────────────────────────┐
│         FuzroDo MCP Server                       │
│      (Stateless Orchestrator)                    │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │  Workflow Execution                    │    │
│  │  - Execute deterministic steps         │    │
│  │  - Call other MCP servers             │    │
│  │  - Coordinate tools                    │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  When LLM reasoning needed:                     │
│  ┌────────────────────────────────────────┐    │
│  │  PAUSE workflow                        │    │
│  │  - Save current state                  │    │
│  │  - Generate resume token               │    │
│  │  - Return instruction to Claude        │    │
│  └────────────────────────────────────────┘    │
└──────────────┬───────────────────────────────────┘
               │ 2. Return partial result
               │    with instructions
               ↓
┌──────────────────────────────────────────────────┐
│         Claude Code Instance                     │
│    (Same instance, still has full context)      │
│                                                  │
│  - Reads instruction                            │
│  - Uses LLM reasoning                           │
│  - Calls other MCPs (Playwright, etc.)         │
│  - Gathers required results                     │
└──────────────┬───────────────────────────────────┘
               │ 3. Resume workflow
               │    with results
               ↓
┌──────────────────────────────────────────────────┐
│         FuzroDo MCP Server                       │
│                                                  │
│  - Loads saved state                            │
│  - Merges results                               │
│  - Continues workflow                           │
│  - Returns final results                        │
└──────────────────────────────────────────────────┘
```

## Key Principles

### 1. **Single Context Window**
- The same Claude instance handles the entire conversation
- No context duplication or loss
- Full conversation history available for all decisions

### 2. **Stateless MCP Server**
- MCP server doesn't need LLM API keys
- No need to manage context or conversation history
- Temporary state storage only for multi-step workflows

### 3. **Clear Delegation**
- MCP returns explicit instructions for Claude
- Specifies required tools and expected outputs
- Claude knows exactly what to do and how to resume

### 4. **Cost Efficient**
- Single LLM session throughout
- No duplicate API calls
- User already paying for Claude session

## Implementation Pattern

### Step 1: Partial Workflow Response

When workflow needs LLM reasoning, return:

```typescript
{
  status: 'awaiting_llm_action',
  workflowId: 'create-jira-with-audio',
  resumeToken: 'wf-uuid-timestamp',
  completedSteps: ['generatePrompt'],
  action: {
    type: 'browser_automation',
    description: 'Create Jira ticket using Playwright',
    prompt: 'Navigate to https://jira..., click Create Issue...',
    requiredOutputs: ['ticketKey', 'ticketUrl'],
    availableTools: ['playwright'],
    context: { projectKey: 'PROJ' } // Optional additional context
  },
  message: 'Please create the Jira ticket and return the ticket key and URL'
}
```

### Step 2: State Persistence

Save workflow state with resume token:

```typescript
class WorkflowStateManager {
  save(workflowId: string, state: any, ttl?: number): string {
    const resumeToken = `${workflowId}-${uuid()}`;
    // Store state with expiration
    this.states.set(resumeToken, {
      workflowId,
      state,
      expiresAt: Date.now() + ttl
    });
    return resumeToken;
  }

  load(resumeToken: string): any {
    // Retrieve and validate state
    // Check expiration
    // Return state or null
  }
}
```

### Step 3: Resume Mechanism

Provide a tool to resume workflows:

```typescript
{
  name: 'resume_workflow',
  description: 'Resume a paused workflow with results from LLM task',
  inputSchema: {
    type: 'object',
    properties: {
      resumeToken: { type: 'string' },
      results: {
        type: 'object',
        description: 'Results matching requiredOutputs'
      }
    }
  }
}
```

### Step 4: Workflow Resume Logic

```typescript
async function resumeWorkflow(resumeToken: string, results: any) {
  // Load saved state
  const savedState = stateManager.load(resumeToken);

  // Merge results into state
  const resumedState = {
    ...savedState,
    ...results,
    resuming: true
  };

  // Continue workflow execution
  const graph = workflow.createGraph();
  const finalResult = await graph.invoke(resumedState);

  // Cleanup saved state
  stateManager.delete(resumeToken);

  return finalResult;
}
```

## Example Flow: Jira Audio Quote Workflow

### Call 1: Start Workflow

**User to Claude:**
> "Create a Jira ticket for dark mode feature with a Bradley Plum quote"

**Claude calls:**
```javascript
fuzrodo__create_jira_with_audio({
  summary: "Implement Dark Mode Toggle",
  description: "Add dark mode support...",
  quote: "In the shadows we find not absence, but presence",
  projectKey: "PROJ"
})
```

**FuzroDo returns:**
```json
{
  "status": "awaiting_llm_action",
  "resumeToken": "jira-audio-abc123",
  "completedSteps": ["generateAtlassianPrompt"],
  "action": {
    "type": "browser_automation",
    "description": "Create Jira ticket using Playwright",
    "prompt": "Navigate to https://jira.company.com...",
    "requiredOutputs": ["ticketKey", "ticketUrl"],
    "availableTools": ["playwright"]
  }
}
```

### Call 2: Claude Executes & Resumes

**Claude (same instance):**
- Reads the instruction
- Uses Playwright MCP to create ticket
- Gets: `PROJ-123`, `https://jira.company.com/browse/PROJ-123`

**Claude calls:**
```javascript
fuzrodo__resume_workflow({
  resumeToken: "jira-audio-abc123",
  results: {
    ticketKey: "PROJ-123",
    ticketUrl: "https://jira.company.com/browse/PROJ-123"
  }
})
```

**FuzroDo:**
- Loads saved state
- Merges ticket info
- Continues: Generate audio → Upload to Jira
- Returns final results

## Benefits vs. True Sub-Agent

| Aspect | Stateless Augmentation | True Sub-Agent |
|--------|----------------------|----------------|
| **Context** | Full conversation history | Only prompt provided |
| **API Keys** | Uses existing Claude session | MCP needs own API keys |
| **Cost** | Single session | Two concurrent sessions |
| **Complexity** | Moderate (state management) | High (LLM integration) |
| **User Experience** | Seamless single conversation | Context gaps possible |
| **Control** | User's Claude in control | MCP spawns autonomous agent |

## When to Use This Pattern

### ✅ Good Use Cases

1. **Browser Automation**: Tasks requiring dynamic page interactions
2. **Complex Decision Making**: Multi-step reasoning with context
3. **Tool Orchestration**: Coordinating multiple MCPs with LLM oversight
4. **Approval Workflows**: User needs to review before continuing
5. **Context-Dependent Actions**: Leveraging conversation history

### ❌ Not Suitable For

1. **Simple API Calls**: Direct REST APIs don't need LLM
2. **Pure Data Processing**: Deterministic transformations
3. **Real-time Streams**: Can't pause/resume effectively
4. **User-less Automation**: No Claude instance to delegate to

## Design Guidelines

### 1. **Make Instructions Clear**

❌ **Bad:**
```javascript
{
  prompt: "Create the ticket",
  requiredOutputs: ["result"]
}
```

✅ **Good:**
```javascript
{
  prompt: `Navigate to ${jiraUrl}/secure/CreateIssue.jspa
           Click issue type dropdown, select "Task"
           Fill summary: "${summary}"
           Fill description: "${description}"
           Click Create button
           Extract ticket key from success message`,
  requiredOutputs: ["ticketKey", "ticketUrl"],
  availableTools: ["playwright"]
}
```

### 2. **Validate Required Outputs**

```typescript
function validateResumeResults(
  action: LLMAction,
  results: Record<string, any>
): void {
  for (const output of action.requiredOutputs) {
    if (!(output in results)) {
      throw new Error(`Missing required output: ${output}`);
    }
  }
}
```

### 3. **Handle Expiration Gracefully**

```typescript
// Set reasonable TTL (30 minutes default)
const resumeToken = stateManager.save(workflowId, state, 30 * 60 * 1000);

// Provide clear error if expired
if (!savedState) {
  throw new Error(
    `Resume token expired or invalid. Please start the workflow again.`
  );
}
```

### 4. **Preserve Workflow Context**

```typescript
// Save enough state to resume correctly
const savedState = {
  workflowId,
  currentStep: 'createTicket',
  completedSteps: ['generatePrompt'],
  // Include all data needed for next steps
  summary: state.summary,
  description: state.description,
  quote: state.quote,
  // Don't save large binary data
};
```

## Error Handling

### Partial Success Pattern

```typescript
// If pause happens after some work completed
{
  status: 'awaiting_llm_action',
  completedSteps: ['generatePrompt', 'validateInputs'],
  // Even if this fails, we've made progress
}

// On resume, check what's already done
if (state.completedSteps.includes('generatePrompt')) {
  // Skip this step
} else {
  // Execute it
}
```

### Timeout Handling

```typescript
// Warn before expiration
const WARNING_THRESHOLD = 25 * 60 * 1000; // 25 minutes

if (Date.now() - state.timestamp > WARNING_THRESHOLD) {
  logger.warn('Workflow state approaching expiration', {
    resumeToken,
    expiresIn: state.expiresAt - Date.now()
  });
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('Workflow State Manager', () => {
  it('should save and load state', () => {
    const token = manager.save('wf-1', { foo: 'bar' });
    const loaded = manager.load(token);
    expect(loaded.foo).toBe('bar');
  });

  it('should handle expired tokens', () => {
    const token = manager.save('wf-1', {}, 1); // 1ms TTL
    await sleep(10);
    expect(manager.load(token)).toBeNull();
  });
});
```

### Integration Tests

```typescript
describe('Pause/Resume Flow', () => {
  it('should pause workflow and resume with results', async () => {
    // Start workflow
    const result1 = await workflow.invoke(initialState);
    expect(result1.status).toBe('awaiting_llm_action');

    // Simulate Claude executing action
    const mockResults = { ticketKey: 'TEST-123' };

    // Resume workflow
    const result2 = await resumeWorkflow(
      result1.resumeToken,
      mockResults
    );
    expect(result2.status).toBe('completed');
    expect(result2.data.ticketKey).toBe('TEST-123');
  });
});
```

## Alternative Patterns

### 1. **Synchronous Callback** (Not MCP Standard)

MCP doesn't support bidirectional communication, but theoretically:

```typescript
// MCP server calls back to Claude during execution
const result = await claudeCallback({
  task: 'create_jira_ticket',
  tools: ['playwright']
});
```

**Problems:**
- Not in MCP specification
- Requires persistent connection
- Complex state management

### 2. **Streaming** (Future Possibility)

```typescript
// Stream partial results as workflow progresses
for await (const update of workflow.stream()) {
  if (update.needsLLM) {
    yield { status: 'awaiting_action', ... };
    const results = await waitForResume();
    workflow.continue(results);
  }
}
```

**Problems:**
- Not widely supported in MCP yet
- Complex client implementation

### 3. **Embedded Agent** (What We Avoided)

FuzroDo spawns its own Claude instances:

**Problems:**
- Expensive (double API costs)
- Context isolation (no conversation history)
- MCP needs API keys (security concern)
- Complex tool use loop
- Against MCP philosophy

## Conclusion

The **Stateless Augmentation MCP** pattern enables sophisticated multi-step workflows that require LLM reasoning, while:

- ✅ Keeping MCP servers simple and stateless
- ✅ Leveraging existing Claude context
- ✅ Maintaining cost efficiency
- ✅ Providing clear user experience
- ✅ Following MCP design philosophy

**Remember:** MCP servers should enhance Claude's capabilities, not try to replace Claude itself.

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [FuzroDo Sub-Agent Architecture](./SUB_AGENT_ARCHITECTURE.md)
- [FuzroDo Implementation Plan](./implementationPlan.md)
