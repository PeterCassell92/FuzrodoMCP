# Sub-Agent Architecture for FuzroDo

## Overview

FuzroDo workflows need to delegate LLM-required tasks to Claude Code while maintaining orchestration control. This document describes the sub-agent pattern for handling tasks that require LLM reasoning.

## The Problem

Some workflow steps require LLM reasoning:
- Browser automation with dynamic page interactions (Playwright)
- Natural language processing
- Context-aware decision making

But FuzroDo is a **deterministic orchestration layer** without built-in LLM capabilities.

## Solution: Delegation Pattern

FuzroDo can **return partial results** that instruct Claude Code to perform LLM tasks, then **resume** the workflow afterward.

### Flow Example

```
1. User: "Create Jira ticket for dark mode with quote"
   ↓
2. Claude calls: mcp__fuzrodo__create_jira_with_audio
   ↓
3. FuzroDo workflow executes:
   - Generates Atlassian prompt
   - Returns: "Please execute this prompt, then call me back with results"
   ↓
4. Claude receives delegation request
   - Executes browser automation with Playwright
   - Gets ticket URL
   ↓
5. Claude calls: mcp__fuzrodo__resume_workflow
   with: { workflowId: "abc123", ticketKey: "PROJ-123", ticketUrl: "..." }
   ↓
6. FuzroDo resumes workflow:
   - Generate audio
   - Upload to Jira
   - Return final results
```

## Implementation Approaches

### Approach 1: Multi-Step Tool Calls (Simple)

Workflows can complete in multiple invocations:

```typescript
// First call
{
  status: 'partial',
  completedSteps: ['generatePrompt'],
  nextAction: {
    type: 'llm_task',
    description: 'Create Jira ticket using Playwright',
    prompt: atlassianPrompt,
    requiredOutputs: ['ticketKey', 'ticketUrl']
  }
}

// Claude executes the task...

// Second call with results
{
  resumeToken: 'workflow-abc123',
  stepData: {
    ticketKey: 'PROJ-123',
    ticketUrl: 'https://jira.company.com/browse/PROJ-123'
  }
}

// Workflow continues and completes
{
  status: 'completed',
  ticketKey: 'PROJ-123',
  audioUrl: 'https://...'
}
```

**Pros:**
- Simple to implement
- Clear separation of concerns
- Claude handles all LLM reasoning

**Cons:**
- Requires multiple tool calls
- State persistence needed between calls

---

### Approach 2: Sampling/Tool Use Pattern (Advanced)

Use MCP's sampling capability (if available) to let workflows request LLM completions:

```typescript
// In workflow node
const result = await requestSampling({
  systemPrompt: 'You are a Jira automation agent',
  userPrompt: atlassianPrompt,
  availableTools: ['playwright'],
  maxTurns: 10
});

// Result contains ticket info
return {
  ticketKey: extractTicketKey(result),
  ticketUrl: extractTicketUrl(result)
};
```

**Note**: This requires MCP server to support sampling, which may not be available in all environments.

---

### Approach 3: Embedded Agent (Complex)

FuzroDo includes its own LLM integration:

```typescript
import { Anthropic } from '@anthropic-ai/sdk';

async function createJiraTicketNode(state, mcpManager) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const result = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    tools: getPlaywrightTools(mcpManager),
    messages: [{ role: 'user', content: atlassianPrompt }]
  });

  // Process tool use loop...
}
```

**Pros:**
- Self-contained workflows
- Can complete in single tool call

**Cons:**
- FuzroDo needs API keys and LLM infrastructure
- Duplicates Claude Code's capabilities
- More expensive (running two LLM sessions)

---

## Recommended Approach: **Multi-Step with State Persistence**

This balances simplicity, clarity, and FuzroDo's architectural goals.

### Implementation Details

#### 1. Workflow State Persistence

```typescript
// src/utils/workflowState.ts
class WorkflowStateManager {
  private states = new Map<string, any>();

  save(workflowId: string, state: any): string {
    const token = `${workflowId}-${Date.now()}`;
    this.states.set(token, state);
    return token;
  }

  load(token: string): any {
    return this.states.get(token);
  }

  delete(token: string): void {
    this.states.delete(token);
  }
}
```

#### 2. Workflow Response Types

```typescript
type WorkflowResponse =
  | CompletedResponse
  | PartialResponse
  | FailedResponse;

interface PartialResponse {
  status: 'awaiting_llm_action';
  resumeToken: string;
  completedSteps: string[];
  action: {
    type: 'browser_automation' | 'text_processing' | 'decision';
    description: string;
    prompt: string;
    requiredOutputs: string[];
    availableTools?: string[]; // MCP tool names
  };
}

interface CompletedResponse {
  status: 'completed';
  success: true;
  data: {
    ticketKey: string;
    ticketUrl: string;
    audioId: string;
    // ...
  };
}
```

#### 3. Resume Tool

Register a separate tool for resuming workflows:

```typescript
// In src/index.ts
{
  name: 'resume_workflow',
  description: 'Resume a paused workflow with results from LLM task',
  inputSchema: {
    type: 'object',
    properties: {
      resumeToken: {
        type: 'string',
        description: 'Token from previous workflow response'
      },
      results: {
        type: 'object',
        description: 'Results from executing the LLM task'
      }
    },
    required: ['resumeToken', 'results']
  }
}
```

#### 4. Workflow Node Pattern

```typescript
// src/nodes/jira/createTicket.ts
export async function createJiraTicketNode(
  state: JiraAudioQuoteState,
  mcpManager: MCPClientManager
): Promise<Partial<JiraAudioQuoteState>> {

  // If resuming with data, use it
  if (state.ticketKey && state.ticketUrl) {
    return {
      completedSteps: [...state.completedSteps, 'createTicket']
    };
  }

  // Otherwise, generate prompt and request LLM action
  const prompt = await mcpManager.callTool('atlassian-prompts', 'generate_prompt', {
    template: 'jira-create-issue',
    substitutions: {
      issueType: state.issueType,
      summary: state.summary,
      description: `${state.description}\n\n> ${state.quote}`,
      priority: state.priority
    }
  });

  return {
    status: 'awaiting_llm_action',
    action: {
      type: 'browser_automation',
      description: 'Create Jira ticket using Playwright',
      prompt: extractPromptText(prompt),
      requiredOutputs: ['ticketKey', 'ticketUrl'],
      availableTools: ['playwright']
    }
  };
}
```

### 5. User Experience

From Claude Code's perspective:

```
User: Create a Jira ticket for dark mode with a quote

Claude: I'll create that ticket and add an audio quote.
[Calls fuzrodo workflow]

FuzroDo: Returns partial response requesting Jira ticket creation

Claude: [Executes Playwright automation]
Created ticket: PROJ-123
[Calls resume_workflow with ticket info]

FuzroDo: Continues workflow, generates audio, uploads

Claude: ✅ Created ticket PROJ-123 with audio quote attached!
```

## Alternative: Simplified API Approach

For this specific workflow, we could avoid the complexity by using **Jira REST API** instead of browser automation:

```typescript
// Direct API call - no LLM needed!
async function createJiraTicketNode(state, mcpManager) {
  const response = await fetch(`${process.env.JIRA_URL}/rest/api/2/issue`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${process.env.JIRA_USER}:${process.env.JIRA_TOKEN}`)}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        project: { key: state.projectKey },
        summary: state.summary,
        description: `${state.description}\n\n{quote}${state.quote}{quote}`,
        issuetype: { name: state.issueType },
        priority: { name: state.priority }
      }
    })
  });

  const ticket = await response.json();

  return {
    ticketKey: ticket.key,
    ticketUrl: `${process.env.JIRA_URL}/browse/${ticket.key}`,
    completedSteps: [...state.completedSteps, 'createTicket']
  };
}
```

This completes in **one tool call**, no LLM delegation needed.

## Decision Matrix

| Approach | Complexity | Single Call? | LLM in FuzroDo? | Use Case |
|----------|-----------|--------------|-----------------|----------|
| Multi-step delegation | Medium | ❌ No | ❌ No | Browser automation required |
| Jira REST API | Low | ✅ Yes | ❌ No | API access available |
| Embedded agent | High | ✅ Yes | ✅ Yes | Complex multi-step LLM tasks |
| Sampling (MCP) | Medium | ✅ Yes | ⚠️ Via MCP | If MCP supports sampling |

## Recommendation for Jira Workflow

**Start with Jira REST API** (simplest), then add multi-step delegation as a feature for more complex workflows.

### Phase 1: Simple Jira Workflow (REST API)
- No browser automation
- Single tool call
- Deterministic and testable

### Phase 2: Generic Sub-Agent Pattern
- Add multi-step support
- State persistence
- Resume capability
- Can handle any LLM-required task

This gives us a working workflow quickly while building toward the more flexible architecture.

## Implementation Priority

1. ✅ **Now**: Build simple workflow with REST API
2. 🔄 **Next**: Add state persistence and resume tool
3. 📋 **Later**: Generic sub-agent delegation pattern
4. 🚀 **Future**: MCP sampling integration (when available)
