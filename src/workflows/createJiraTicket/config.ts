/**
 * Create Jira Ticket Workflow Configuration
 */

import { WorkflowRequirements } from '../../types/workflow';
import { JSONSchema } from '../../types/workflow';

export const workflowConfig: WorkflowRequirements = {
  mcpServers: [
    {
      name: 'atlassian-prompts',
      tools: ['generate_prompt'],
      optional: false,
    },
  ],
  environment: [],
};

export const inputSchema: JSONSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Jira ticket summary/title',
    },
    description: {
      type: 'string',
      description: 'Jira ticket description',
    },
    projectKey: {
      type: 'string',
      description: 'Jira project key (e.g., FEDS)',
    },
    context: {
      type: 'string',
      description: 'Optional context for the ticket and quote generation',
    },
  },
  required: ['summary', 'description', 'projectKey'],
};

export const outputSchema: JSONSchema = {
  type: 'object',
  properties: {
    atlassianPrompt: {
      type: 'string',
      description: 'Playwright automation instructions for creating the Jira ticket',
    },
    nextWorkflow: {
      type: 'string',
      description: 'The next workflow to call after ticket creation',
    },
    nextWorkflowDescription: {
      type: 'string',
      description: 'Description of what the next workflow does',
    },
  },
  required: ['atlassianPrompt', 'nextWorkflow'],
};
