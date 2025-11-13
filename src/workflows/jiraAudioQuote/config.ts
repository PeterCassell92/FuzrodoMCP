/**
 * Configuration for Jira Audio Quote workflow
 */

import { WorkflowRequirements, JSONSchema } from '../../types/workflow';

export const workflowConfig: WorkflowRequirements = {
  mcpServers: [
    {
      name: 'atlassian-prompts',
      tools: ['generate_prompt'],
      optional: false
    },
    {
      name: 'elevenlabs',
      tools: ['create_wise_quote_audio', 'download_audio'],
      optional: false
    }
    // NOTE: Playwright is NOT required here!
    // FuzroDo generates instructions that Claude executes via Playwright.
    // Claude (not FuzroDo) calls Playwright based on those instructions.
  ],
  environment: ['OPENAI_API_KEY'] // For sub-agent quote enhancement
};

export const inputSchema: JSONSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Jira ticket summary/title'
    },
    description: {
      type: 'string',
      description: 'Jira ticket description'
    },
    projectKey: {
      type: 'string',
      description: 'Jira project key (e.g., PROJ)'
    },
    context: {
      type: 'string',
      description: 'Optional context for quote enhancement (e.g., "mystical, contemplative")'
    }
  },
  required: ['summary', 'description', 'projectKey']
};

export const outputSchema: JSONSchema = {
  type: 'object',
  properties: {
    ticketKey: {
      type: 'string',
      description: 'Created Jira ticket key'
    },
    ticketUrl: {
      type: 'string',
      description: 'URL to the created Jira ticket'
    },
    quote: {
      type: 'string',
      description: 'Generated quote from Atlassian prompts'
    },
    enhancedQuote: {
      type: 'string',
      description: 'Enhanced quote used for audio'
    },
    audioPath: {
      type: 'string',
      description: 'Path to downloaded audio file'
    }
  }
};
