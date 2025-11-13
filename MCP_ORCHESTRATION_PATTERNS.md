# MCP Orchestration Patterns

FuzroDo supports two complementary patterns for orchestrating workflows that require LLM reasoning:

1. **Stateless Augmentation (Human-in-the-Loop)** - For context-dependent tasks
2. **True Sub-Agent** - For self-contained tasks

## Pattern 1: Stateless Augmentation (Human-in-the-Loop)

### When to Use

Use this pattern when the task requires:
- Full conversation context from the user's session
- Access to the user's Claude Code environment and tools
- Understanding of user intent and preferences
- Complex multi-step reasoning with user oversight

**Examples:**
- Browser automation (creating Jira tickets via Playwright)
- Complex decision making based on conversation history
- Tasks requiring user approval or clarification

### How It Works

```
User → Claude Code → FuzroDo (pause workflow) → Claude Code (executes task) → FuzroDo (resume)
       └─────────── Same Claude instance with full context ─────────────┘
```

FuzroDo pauses the workflow and returns instructions to the same Claude Code instance that initiated the workflow. Claude executes the task with full context, then resumes the workflow with results.

### Implementation

See [STATELESS_AUGMENTATION_MCP.md](./STATELESS_AUGMENTATION_MCP.md) for detailed implementation guidance.

**Key Points:**
- Single context window throughout
- No duplicate API costs
- Leverages existing Claude session
- Clear delegation via `PartialWorkflowResult`

**Example Response:**

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
    availableTools: ['playwright']
  },
  message: 'Please create the Jira ticket and return the ticket key and URL'
}
```

---

## Pattern 2: True Sub-Agent

### When to Use

Use this pattern when the task is:
- **Self-contained** - Can be completed with just the input provided
- **Stateless** - Doesn't need conversation history or user context
- **Deterministic goal** - Clear success criteria
- **No tool coordination** - Doesn't require orchestrating multiple MCPs

**Examples:**
- Enhancing a quote for audio impact
- Summarizing text
- Data transformation/formatting
- Content generation with specific guidelines

### How It Works

```
User → Claude Code → FuzroDo (spawn sub-agent) → OpenAI LLM → FuzroDo → Claude Code
                            └── Isolated reasoning ──┘
```

FuzroDo spawns an isolated LLM instance (via LangChain + OpenAI) to complete the self-contained task. The sub-agent has no access to the original conversation context.

### Implementation

#### 1. Install Dependencies

```bash
npm install @langchain/openai @langchain/core
```

#### 2. Configure Environment

Add to your `.env` file:

```env
# OpenAI API Key for sub-agent reasoning
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o  # or gpt-4o-mini for faster/cheaper tasks
```

#### 3. Create Sub-Agent Node

```typescript
// src/nodes/subAgents/enhanceQuote.ts

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../../utils/logger';

export interface EnhanceQuoteInput {
  quote: string;
  context?: string; // Optional context like theme or mood
}

export interface EnhanceQuoteOutput {
  enhancedQuote: string;
  voiceDirections: string;
  reasoning: string;
}

/**
 * Enhance a quote for audio impact using a sub-agent
 * This is a self-contained task that doesn't need conversation context
 */
export async function enhanceQuoteForAudio(
  input: EnhanceQuoteInput
): Promise<EnhanceQuoteOutput> {
  logger.info('Spawning sub-agent to enhance quote for audio', {
    quoteLength: input.quote.length
  });

  // Initialize OpenAI via LangChain
  const model = new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL || 'gpt-4o',
    temperature: 0.7, // Allow creativity for enhancement
    openAIApiKey: process.env.OPENAI_API_KEY
  });

  // System prompt defines the sub-agent's behavior
  const systemPrompt = `You are a mystical quote enhancement specialist for text-to-speech audio.

Your task is to:
1. Enhance quotes for maximum audio impact using a wise, contemplative tone
2. Add subtle voice directions for ElevenLabs TTS (use [pause] for dramatic pauses)
3. Maintain the essence and wisdom of the original quote
4. Keep enhancements natural and not over-the-top

Voice Direction Guidelines:
- Use [pause] for dramatic effect (sparingly - 1-2 times max)
- Add slight emphasis to key words (e.g., "In the *shadows* we find...")
- Ensure flow and rhythm for spoken delivery
- Maintain a mystical, philosophical tone

Output Format (JSON):
{
  "enhancedQuote": "The improved quote with [pause] markers",
  "voiceDirections": "Brief notes on tone and emphasis",
  "reasoning": "Why these enhancements improve audio impact"
}`;

  const userPrompt = input.context
    ? `Enhance this quote (context: ${input.context}):\n\n"${input.quote}"`
    : `Enhance this quote:\n\n"${input.quote}"`;

  try {
    // Invoke the sub-agent
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    // Parse JSON response
    const content = response.content.toString();

    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    const result = JSON.parse(jsonStr);

    logger.info('Sub-agent successfully enhanced quote', {
      originalLength: input.quote.length,
      enhancedLength: result.enhancedQuote.length
    });

    return {
      enhancedQuote: result.enhancedQuote,
      voiceDirections: result.voiceDirections,
      reasoning: result.reasoning
    };
  } catch (error) {
    logger.error('Sub-agent failed to enhance quote', { error });

    // Fallback: return original quote with basic pause
    return {
      enhancedQuote: `${input.quote} [pause]`,
      voiceDirections: 'Use contemplative, wise tone',
      reasoning: 'Sub-agent error - using original quote with minimal enhancement'
    };
  }
}
```

#### 4. Integrate into Workflow

```typescript
// In your workflow node (e.g., src/nodes/jira/processQuote.ts)
import { enhanceQuoteForAudio } from '../subAgents/enhanceQuote';

export async function processQuoteNode(
  state: WorkflowState,
  mcpManager: MCPClientManager
): Promise<Partial<WorkflowState>> {
  try {
    // Call sub-agent to enhance quote
    const enhanced = await enhanceQuoteForAudio({
      quote: state.quote,
      context: 'mystical, contemplative'
    });

    return {
      currentStep: 'generateAudio',
      completedSteps: [...state.completedSteps, 'enhanceQuote'],
      enhancedQuote: enhanced.enhancedQuote,
      voiceDirections: enhanced.voiceDirections
    };
  } catch (error) {
    return {
      currentStep: 'error',
      error: `Failed to enhance quote: ${error.message}`,
      errors: [...state.errors, {
        step: 'enhanceQuote',
        error: error.message
      }]
    };
  }
}
```

### Advanced: Streaming Responses

For longer-running sub-agent tasks, you can stream responses:

```typescript
import { ChatOpenAI } from '@langchain/openai';

const model = new ChatOpenAI({
  modelName: 'gpt-4o',
  streaming: true, // Enable streaming
  openAIApiKey: process.env.OPENAI_API_KEY
});

let accumulatedContent = '';

const stream = await model.stream([
  new SystemMessage(systemPrompt),
  new HumanMessage(userPrompt)
]);

for await (const chunk of stream) {
  accumulatedContent += chunk.content;
  logger.debug('Sub-agent streaming chunk', {
    chunkLength: chunk.content.toString().length
  });
}

// Process accumulated content
const result = JSON.parse(accumulatedContent);
```

### Benefits vs. Stateless Augmentation

| Aspect | True Sub-Agent | Stateless Augmentation |
|--------|----------------|------------------------|
| **Context** | Isolated, self-contained | Full conversation history |
| **Speed** | No pause/resume cycle | Requires pause/resume |
| **Cost** | Additional API calls | Uses existing session |
| **Use Case** | Simple transformations | Complex multi-step tasks |
| **User Oversight** | Minimal | Full visibility |

### Cost Considerations

Sub-agents incur additional API costs. Optimize by:

1. **Use Smaller Models**: `gpt-4o-mini` for simple tasks
2. **Cache System Prompts**: LangChain supports prompt caching
3. **Limit Token Usage**: Set `maxTokens` in model config
4. **Batch When Possible**: Process multiple items in one call

```typescript
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini', // Cheaper for simple tasks
  temperature: 0.7,
  maxTokens: 500, // Limit output length
  openAIApiKey: process.env.OPENAI_API_KEY
});
```

### Error Handling

Always provide fallback behavior:

```typescript
try {
  const result = await subAgent.invoke(input);
  return result;
} catch (error) {
  logger.error('Sub-agent failed, using fallback', { error });

  // Return minimal viable output
  return {
    enhancedQuote: input.quote, // Original quote
    voiceDirections: 'Default contemplative tone',
    reasoning: 'Sub-agent unavailable - using original'
  };
}
```

### Testing Sub-Agents

```typescript
// tests/subAgents/enhanceQuote.test.ts

import { enhanceQuoteForAudio } from '../../src/nodes/subAgents/enhanceQuote';

describe('enhanceQuoteForAudio', () => {
  it('should enhance quote with voice directions', async () => {
    const result = await enhanceQuoteForAudio({
      quote: 'In the shadows we find not absence, but presence.'
    });

    expect(result.enhancedQuote).toBeTruthy();
    expect(result.voiceDirections).toBeTruthy();
    expect(result.reasoning).toBeTruthy();

    // Should contain some enhancement markers
    expect(
      result.enhancedQuote.includes('[pause]') ||
      result.enhancedQuote.length > 50
    ).toBe(true);
  });

  it('should handle errors gracefully', async () => {
    // Mock OpenAI failure
    process.env.OPENAI_API_KEY = 'invalid';

    const result = await enhanceQuoteForAudio({
      quote: 'Test quote'
    });

    // Should return fallback
    expect(result.enhancedQuote).toContain('Test quote');
  });
});
```

---

## Choosing the Right Pattern

### Decision Matrix

| Task Characteristic | Use Pattern |
|---------------------|-------------|
| Needs conversation context | Stateless Augmentation |
| Self-contained transformation | True Sub-Agent |
| Requires user tools (Playwright) | Stateless Augmentation |
| Simple text processing | True Sub-Agent |
| Multi-step coordination | Stateless Augmentation |
| Single-purpose enhancement | True Sub-Agent |
| Requires user approval | Stateless Augmentation |
| Deterministic goal | True Sub-Agent |

### Example: Jira Audio Quote Workflow

This workflow uses **BOTH** patterns:

```typescript
// Workflow steps:
1. Generate Atlassian prompt (deterministic, no LLM)
2. Create Jira ticket (Stateless Augmentation - needs Playwright & context)
3. Enhance quote (True Sub-Agent - self-contained text transformation)
4. Generate audio (deterministic, ElevenLabs API)
5. Upload to Jira (deterministic, Jira API)
```

**Step 2** uses Stateless Augmentation because:
- Requires browser automation via Playwright MCP
- Needs understanding of user's ticket requirements
- Benefits from conversation context

**Step 3** uses True Sub-Agent because:
- Self-contained: just enhance the quote text
- No external tools needed
- Doesn't need conversation context
- Faster execution (no pause/resume)

---

## Implementation Checklist

### For Stateless Augmentation
- [ ] Define `LLMAction` with clear prompt and required outputs
- [ ] Implement pause logic in workflow node
- [ ] Save workflow state with resume token
- [ ] Return `PartialWorkflowResult` to Claude
- [ ] Handle resume in `resume_workflow` tool
- [ ] Validate results match required outputs

### For True Sub-Agent
- [ ] Install `@langchain/openai` and `@langchain/core`
- [ ] Configure `OPENAI_API_KEY` in `.env`
- [ ] Create sub-agent node with clear system prompt
- [ ] Implement error handling with fallback
- [ ] Parse and validate sub-agent output
- [ ] Log sub-agent interactions for debugging
- [ ] Write unit tests for sub-agent

---

## Best Practices

### 1. Prefer Stateless Augmentation When Uncertain

If you're unsure whether a task needs context, default to Stateless Augmentation. The user's Claude instance can always handle it.

### 2. Keep Sub-Agents Simple

Sub-agents should have:
- Clear, single-purpose goals
- Well-defined input/output schemas
- Comprehensive system prompts
- Fallback behavior for failures

### 3. Document Cost Implications

Always document when workflows use sub-agents:

```typescript
export const workflowConfig: WorkflowRequirements = {
  mcpServers: [...],
  environment: ['OPENAI_API_KEY'], // Indicates sub-agent usage
  notes: 'Uses OpenAI sub-agent for quote enhancement (adds ~$0.01 per execution)'
};
```

### 4. Test Both Patterns

Ensure workflows handle both patterns correctly:
- Test pause/resume cycles for Stateless Augmentation
- Test sub-agent failures and fallbacks
- Measure latency and cost differences

---

## Summary

FuzroDo's dual-pattern approach provides flexibility:

- **Stateless Augmentation**: Leverage user's Claude with full context
- **True Sub-Agent**: Fast, isolated transformations for self-contained tasks

Choose the pattern that best fits each workflow step. Many workflows will use **both** patterns at different stages.

For detailed implementation of Stateless Augmentation, see [STATELESS_AUGMENTATION_MCP.md](./STATELESS_AUGMENTATION_MCP.md).
