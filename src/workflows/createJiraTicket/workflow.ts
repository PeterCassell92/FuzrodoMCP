/**
 * Create Jira Ticket Workflow
 * Generates instructions for Claude to create a Jira ticket with Bradley Plum quote
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { CreateJiraTicketState } from './state';
import { WorkflowDefinition } from '../../types/workflow';
import { workflowConfig, inputSchema, outputSchema } from './config';
import { MCPClientManager } from '../../utils/mcpClient';
import { generatePromptNode } from '../../nodes/jira/generatePrompt';

/**
 * Create the workflow graph
 */
function createGraph() {
  const mcpManager = new MCPClientManager();

  // Define state annotation
  const StateAnnotation = Annotation.Root({
    currentStep: Annotation<string>,
    completedSteps: Annotation<string[]>,
    summary: Annotation<string>,
    description: Annotation<string>,
    projectKey: Annotation<string>,
    context: Annotation<string | undefined>,
    atlassianPrompt: Annotation<string | undefined>,
    nextWorkflow: Annotation<string | undefined>,
    nextWorkflowDescription: Annotation<string | undefined>,
    error: Annotation<string | undefined>,
    errors: Annotation<Array<{ step: string; error: string }>>,
  });

  // Simple linear workflow - just generate the prompt and return instructions
  const workflow = new StateGraph(StateAnnotation)
    .addNode('generatePrompt', async (state) => {
      const result = await generatePromptNode(
        state as any,
        mcpManager
      );

      // Add next workflow instructions
      return {
        ...result,
        nextWorkflow: 'create_audio_quote_and_append_to_ticket',
        nextWorkflowDescription:
          'After creating the ticket, call this workflow with ticketKey, ticketUrl, and the extracted Bradley Plum quote to generate audio and attach it to the ticket',
      };
    })
    .addEdge(START, 'generatePrompt')
    .addEdge('generatePrompt', END);

  return workflow.compile();
}

/**
 * Workflow definition
 */
export const createJiraTicketWorkflow: WorkflowDefinition = {
  id: 'create_jira_ticket',
  name: 'Create Jira Ticket with Quote Instructions',
  description:
    'Generates Playwright instructions for creating a Jira ticket with Bradley Plum quote, and tells Claude which workflow to call next',
  version: '1.0.0',
  requirements: workflowConfig,
  inputSchema,
  outputSchema,
  createGraph,
};
