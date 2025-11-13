/**
 * Audio Quote and Append Workflow Configuration
 */

import { WorkflowRequirements } from '../../types/workflow';
import { JSONSchema } from '../../types/workflow';

export const workflowConfig: WorkflowRequirements = {
  mcpServers: [
    {
      name: 'elevenlabs',
      tools: ['create_wise_quote_audio', 'download_audio'],
      optional: false,
    },
    {
      name: 'atlassian-prompts',
      tools: ['generate_prompt'],
      optional: false,
    },
  ],
  environment: ['OPENAI_API_KEY'],
};

export const inputSchema: JSONSchema = {
  type: 'object',
  properties: {
    ticketKey: {
      type: 'string',
      description: 'Jira ticket key (e.g., FEDS-2002)',
    },
    ticketUrl: {
      type: 'string',
      description: 'Full URL to the Jira ticket',
    },
    quote: {
      type: 'string',
      description: 'Bradley Plum quote extracted from the ticket',
    },
    projectKey: {
      type: 'string',
      description: 'Jira project key (e.g., FEDS)',
    },
    context: {
      type: 'string',
      description: 'Optional context for quote enhancement (e.g., "mystical, contemplative")',
    },
  },
  required: ['ticketKey', 'ticketUrl', 'quote', 'projectKey'],
};

export const outputSchema: JSONSchema = {
  type: 'object',
  properties: {
    ticketKey: {
      type: 'string',
      description: 'Jira ticket key',
    },
    ticketUrl: {
      type: 'string',
      description: 'Jira ticket URL',
    },
    enhancedQuote: {
      type: 'string',
      description: 'Enhanced quote optimized for text-to-speech',
    },
    audioPath: {
      type: 'string',
      description: 'Local path to the generated audio file',
    },
    atlassianPrompt: {
      type: 'string',
      description: 'Playwright instructions for attaching the audio file to Jira',
    },
    completedSteps: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of completed workflow steps',
    },
  },
  required: ['ticketKey', 'ticketUrl', 'enhancedQuote', 'audioPath', 'atlassianPrompt'],
};
