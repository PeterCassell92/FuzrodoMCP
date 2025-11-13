# FuzroDo Testing Strategy

## Overview -- JUST SKETCHING OUT POSSIBLE TESTING STRATEGIES. NOTHING SET IN STONE YET

FuzroDo requires comprehensive testing at multiple levels due to its orchestration role. This document outlines our testing strategy, focusing on integration tests that validate MCP server connectivity and workflow execution.

## Testing Levels

### 1. Unit Tests
- Individual utility functions (logger, error classes)
- Workflow registry operations
- Requirement validation logic (mocked MCP calls)

### 2. Integration Tests
- MCP client manager connecting to real MCP servers
- Tool discovery and validation
- Workflow execution with real MCP servers
- End-to-end workflow scenarios

### 3. Contract Tests
- Validate MCP server tool schemas haven't changed
- Ensure backward compatibility
- Detect breaking changes early

## Test Framework: Jest

We'll use Jest for its excellent TypeScript support, mocking capabilities, and async testing features.

### Installation

```bash
npm install --save-dev jest @types/jest ts-jest
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  testTimeout: 30000, // 30s for integration tests with real MCP servers
};
```

## Determinism Considerations

### Deterministic Tests
These can use real MCP servers with predictable outputs:

1. **Tool Discovery**: `listTools()` returns consistent schemas
2. **Connection Tests**: Can we connect? Does the server respond?
3. **Schema Validation**: Does the tool have expected parameters?
4. **Simple Atlassian Prompts**: Template generation is deterministic given same inputs

### Non-Deterministic Tests
These need special handling:

1. **ElevenLabs Audio Generation**:
   - Audio IDs change each time
   - File contents vary
   - **Solution**: Mock these tests OR validate structure (not content)

2. **Playwright Browser Automation**:
   - External websites change
   - Network conditions vary
   - **Solution**: Use test fixtures or local HTML files

3. **Jira Ticket Creation**:
   - Creates real tickets (side effects!)
   - Ticket IDs increment
   - **Solution**: Use test Jira instance OR mock for unit tests

## Test Structure

```
tests/
├── unit/                          # Fast, no external dependencies
│   ├── logger.test.ts
│   ├── registry.test.ts
│   ├── requirements.test.ts
│   └── errors.test.ts
│
├── integration/                   # Real MCP server connections
│   ├── mcp-client.test.ts        # Basic connectivity
│   ├── mcp-tools.test.ts         # Tool discovery and schemas
│   └── workflows/
│       └── example.test.ts       # End-to-end workflow tests
│
├── contracts/                     # Schema validation tests
│   ├── elevenlabs.contract.test.ts
│   ├── atlassian.contract.test.ts
│   └── playwright.contract.test.ts
│
└── fixtures/                      # Test data
    ├── mock-mcp-responses.json
    └── expected-schemas.json
```

## Integration Test Examples

### Test 1: MCP Server Connectivity

```typescript
// tests/integration/mcp-client.test.ts
import { MCPClientManager } from '../../src/utils/mcpClient';

describe('MCP Client Manager Integration', () => {
  let manager: MCPClientManager;

  beforeAll(() => {
    manager = new MCPClientManager();
  });

  afterAll(async () => {
    await manager.disconnectAll();
  });

  describe('ElevenLabs MCP', () => {
    it('should connect to ElevenLabs MCP server', async () => {
      const client = await manager.connect('elevenlabs');
      expect(client).toBeDefined();
    });

    it('should list available tools', async () => {
      const tools = await manager.listTools('elevenlabs');
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should have create_wise_quote_audio tool', async () => {
      const tools = await manager.listTools('elevenlabs');
      const tool = tools.find(t => t.name === 'create_wise_quote_audio');
      expect(tool).toBeDefined();
    });
  });

  describe('Atlassian Prompts MCP', () => {
    it('should connect to Atlassian Prompts MCP server', async () => {
      const client = await manager.connect('atlassian-prompts');
      expect(client).toBeDefined();
    });

    it('should have generate_prompt tool', async () => {
      const tools = await manager.listTools('atlassian-prompts');
      const tool = tools.find(t => t.name === 'generate_prompt');
      expect(tool).toBeDefined();
    });
  });

  describe('Playwright MCP', () => {
    it('should connect to Playwright MCP server', async () => {
      const client = await manager.connect('playwright');
      expect(client).toBeDefined();
    });

    it('should have browser navigation tools', async () => {
      const tools = await manager.listTools('playwright');
      const navTool = tools.find(t => t.name === 'browser_navigate');
      expect(navTool).toBeDefined();
    });
  });
});
```

### Test 2: Tool Schema Validation (Contract Tests)

```typescript
// tests/contracts/elevenlabs.contract.test.ts
import { MCPClientManager } from '../../src/utils/mcpClient';
import expectedSchemas from '../fixtures/expected-schemas.json';

describe('ElevenLabs MCP Contract', () => {
  let manager: MCPClientManager;

  beforeAll(async () => {
    manager = new MCPClientManager();
    await manager.connect('elevenlabs');
  });

  afterAll(async () => {
    await manager.disconnectAll();
  });

  it('create_wise_quote_audio should match expected schema', async () => {
    const tools = await manager.listTools('elevenlabs');
    const tool = tools.find(t => t.name === 'create_wise_quote_audio');

    expect(tool).toBeDefined();
    expect(tool!.inputSchema.type).toBe('object');

    // Validate required properties exist
    const props = tool!.inputSchema.properties;
    expect(props).toHaveProperty('text');
    expect(props.text.type).toBe('string');

    // Warn if schema has changed but don't fail
    const expectedProps = expectedSchemas.elevenlabs.create_wise_quote_audio.properties;
    const actualProps = Object.keys(props);
    const expectedPropNames = Object.keys(expectedProps);

    const missingProps = expectedPropNames.filter(p => !actualProps.includes(p));
    const newProps = actualProps.filter(p => !expectedPropNames.includes(p));

    if (missingProps.length > 0) {
      console.warn(`⚠️  Missing expected properties: ${missingProps.join(', ')}`);
    }

    if (newProps.length > 0) {
      console.warn(`ℹ️  New properties found: ${newProps.join(', ')}`);
    }
  });

  it('download_audio should match expected schema', async () => {
    const tools = await manager.listTools('elevenlabs');
    const tool = tools.find(t => t.name === 'download_audio');

    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties).toHaveProperty('audio_id');
    expect(tool!.inputSchema.properties).toHaveProperty('output_path');
  });
});
```

### Test 3: Deterministic Tool Execution

```typescript
// tests/integration/mcp-tools.test.ts
import { MCPClientManager } from '../../src/utils/mcpClient';

describe('MCP Tool Execution', () => {
  let manager: MCPClientManager;

  beforeAll(() => {
    manager = new MCPClientManager();
  });

  afterAll(async () => {
    await manager.disconnectAll();
  });

  describe('Atlassian Prompts (Deterministic)', () => {
    it('should generate consistent prompt for same input', async () => {
      const input = {
        template: 'jira-create-issue',
        substitutions: {
          issueType: 'Task',
          summary: 'Test Issue',
          description: 'Test Description'
        }
      };

      const result1 = await manager.callTool('atlassian-prompts', 'generate_prompt', input);
      const result2 = await manager.callTool('atlassian-prompts', 'generate_prompt', input);

      // Should produce identical output for same input
      expect(result1).toEqual(result2);
    });
  });

  describe('ElevenLabs (Non-Deterministic)', () => {
    it('should create audio and return valid structure', async () => {
      const result = await manager.callTool('elevenlabs', 'create_wise_quote_audio', {
        text: 'Test quote for integration testing',
        voice_id: 'test-voice'
      });

      // Validate structure, not content
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);

      // Audio ID should be present (but we don't check its value)
      const textContent = result.content.find((c: any) => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent.text).toContain('audio'); // Contains audio-related info
    });

    // This test creates side effects - mark as integration only
    it.skip('should generate and download audio file', async () => {
      // Only run in CI with proper cleanup
      const createResult = await manager.callTool('elevenlabs', 'create_wise_quote_audio', {
        text: 'Integration test audio',
      });

      // Extract audio ID from result
      // Download and verify file exists
      // Clean up file
    });
  });
});
```

### Test 4: Workflow Requirement Validation

```typescript
// tests/integration/workflows/validation.test.ts
import { workflowRegistry } from '../../../src/workflows/registry';
import { mcpClientManager } from '../../../src/utils/mcpClient';
import { validateWorkflowRequirements } from '../../../src/utils/requirements';
import { WorkflowDefinition } from '../../../src/types/workflow';

describe('Workflow Requirement Validation', () => {
  afterAll(async () => {
    await mcpClientManager.disconnectAll();
  });

  it('should validate requirements for a valid workflow', async () => {
    const testWorkflow: WorkflowDefinition = {
      id: 'test-workflow',
      name: 'Test Workflow',
      description: 'Test',
      version: '1.0.0',
      requirements: {
        mcpServers: [
          {
            name: 'elevenlabs',
            tools: ['create_wise_quote_audio'],
            optional: false
          }
        ]
      },
      inputSchema: { type: 'object', properties: {} },
      createGraph: () => null as any
    };

    const result = await validateWorkflowRequirements(testWorkflow, mcpClientManager);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.availableServers).toContain('elevenlabs');
  });

  it('should fail validation for missing MCP server', async () => {
    const testWorkflow: WorkflowDefinition = {
      id: 'test-workflow',
      name: 'Test Workflow',
      description: 'Test',
      version: '1.0.0',
      requirements: {
        mcpServers: [
          {
            name: 'nonexistent-server',
            tools: ['some-tool'],
            optional: false
          }
        ]
      },
      inputSchema: { type: 'object', properties: {} },
      createGraph: () => null as any
    };

    const result = await validateWorkflowRequirements(testWorkflow, mcpClientManager);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.missingServers).toContain('nonexistent-server');
  });

  it('should fail validation for missing tool', async () => {
    const testWorkflow: WorkflowDefinition = {
      id: 'test-workflow',
      name: 'Test Workflow',
      description: 'Test',
      version: '1.0.0',
      requirements: {
        mcpServers: [
          {
            name: 'elevenlabs',
            tools: ['nonexistent_tool'],
            optional: false
          }
        ]
      },
      inputSchema: { type: 'object', properties: {} },
      createGraph: () => null as any
    };

    const result = await validateWorkflowRequirements(testWorkflow, mcpClientManager);

    expect(result.valid).toBe(false);
    expect(result.missingTools).toContainEqual({
      server: 'elevenlabs',
      tool: 'nonexistent_tool'
    });
  });
});
```

## Test Fixtures

```json
// tests/fixtures/expected-schemas.json
{
  "elevenlabs": {
    "create_wise_quote_audio": {
      "properties": {
        "text": { "type": "string" },
        "voice_id": { "type": "string" },
        "model_id": { "type": "string" },
        "stability": { "type": "number" },
        "similarity_boost": { "type": "number" },
        "style": { "type": "number" },
        "use_speaker_boost": { "type": "boolean" }
      }
    },
    "download_audio": {
      "properties": {
        "audio_id": { "type": "string" },
        "output_path": { "type": "string" }
      }
    }
  },
  "atlassian-prompts": {
    "generate_prompt": {
      "properties": {
        "template": { "type": "string" },
        "substitutions": { "type": "object" }
      }
    }
  }
}
```

## Running Tests

### NPM Scripts

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:contracts": "jest tests/contracts",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### Test Execution Strategy

1. **Pre-commit**: Run unit tests (fast, no dependencies)
2. **Pre-push**: Run unit + integration tests
3. **CI/CD**: Run all tests including contracts
4. **Nightly**: Full integration suite with all MCP servers

### Environment Variables for Tests

```bash
# .env.test
LOG_LEVEL=error  # Reduce noise during tests

# MCP Server configurations (same as .env)
ELEVENLABS_MCP_TRANSPORT=stdio
ELEVENLABS_MCP_COMMAND=node
ELEVENLABS_MCP_ARGS=["c:/Users/peter/Documents/ElevenLabsMCP/dist/index.js"]

# ... other MCP servers
```

## Handling Side Effects

### Strategy 1: Use Test Instances
- Test Jira instance
- Test file directories (cleaned up after)
- Separate ElevenLabs account/credits

### Strategy 2: Mock External Calls
```typescript
// For expensive/side-effect operations
jest.mock('../../src/utils/mcpClient', () => ({
  mcpClientManager: {
    callTool: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'mocked response' }]
    })
  }
}));
```

### Strategy 3: Skip in CI
```typescript
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

(runIntegrationTests ? it : it.skip)('should create real Jira ticket', async () => {
  // Test that creates side effects
});
```

## Continuous Monitoring

### Health Check Script

```typescript
// scripts/health-check.ts
// Run daily to detect MCP server changes
import { mcpClientManager } from '../src/utils/mcpClient';
import expectedSchemas from '../tests/fixtures/expected-schemas.json';

async function healthCheck() {
  const servers = ['elevenlabs', 'atlassian-prompts', 'playwright'];

  for (const server of servers) {
    try {
      const tools = await mcpClientManager.listTools(server);
      console.log(`✅ ${server}: ${tools.length} tools available`);

      // Check for schema changes
      // Report differences
    } catch (error) {
      console.error(`❌ ${server}: Failed to connect`);
    }
  }
}

healthCheck();
```

## Determinism Summary

| Test Type | Deterministic? | Strategy |
|-----------|----------------|----------|
| Tool discovery | ✅ Yes | Direct test |
| Atlassian prompt generation | ✅ Yes | Direct test with assertion |
| ElevenLabs audio generation | ❌ No | Test structure, not content |
| Playwright browser automation | ⚠️ Depends | Use local fixtures |
| Jira ticket creation | ❌ No (side effects) | Mock or test instance |
| Schema validation | ✅ Yes | Contract tests |

## Next Steps

1. Set up Jest and create `jest.config.js`
2. Create test fixtures directory
3. Implement basic connectivity tests
4. Add contract tests for schema validation
5. Create health check script
6. Document test data cleanup procedures
