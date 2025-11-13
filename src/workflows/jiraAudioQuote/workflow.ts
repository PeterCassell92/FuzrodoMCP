/**
 * Jira Audio Quote Workflow
 * Creates a Jira ticket with a Bradley Plum quote and generates audio for it
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { JiraAudioQuoteState } from './state';
import { WorkflowDefinition } from '../../types/workflow';
import { workflowConfig, inputSchema, outputSchema } from './config';
import { MCPClientManager } from '../../utils/mcpClient';

// Import nodes
import { generatePromptNode } from '../../nodes/jira/generatePrompt';
import { processQuoteNode } from '../../nodes/jira/processQuote';
import { generateAudioNode } from '../../nodes/audio/generateAudio';
import { downloadAudioNode } from '../../nodes/audio/downloadAudio';

/**
 * Create the workflow graph
 */
function createGraph() {
  // Note: We need to pass mcpManager to nodes, so we'll wrap them
  const mcpManager = new MCPClientManager();

  // Define state annotation for proper typing
  const StateAnnotation = Annotation.Root({
    currentStep: Annotation<string>,
    completedSteps: Annotation<string[]>,
    summary: Annotation<string>,
    description: Annotation<string>,
    projectKey: Annotation<string>,
    context: Annotation<string | undefined>,
    atlassianPrompt: Annotation<string | undefined>,
    quote: Annotation<string | undefined>,
    ticketKey: Annotation<string | undefined>,
    ticketUrl: Annotation<string | undefined>,
    enhancedQuote: Annotation<string | undefined>,
    voiceDirections: Annotation<string | undefined>,
    audioId: Annotation<string | undefined>,
    audioPath: Annotation<string | undefined>,
    resuming: Annotation<boolean | undefined>,
    error: Annotation<string | undefined>,
    errors: Annotation<Array<{step: string; error: string}>>,
    // PartialWorkflowResult properties
    status: Annotation<string | undefined>,
    workflowId: Annotation<string | undefined>,
    resumeToken: Annotation<string | undefined>,
    action: Annotation<any>,
    message: Annotation<string | undefined>
  });

  // Create workflow with annotation
  const workflow = new StateGraph(StateAnnotation)
    // Add nodes with mcpManager
    .addNode('generatePrompt', async (state) => generatePromptNode(state as JiraAudioQuoteState, mcpManager))
    .addNode('processQuote', async (state) => processQuoteNode(state as JiraAudioQuoteState, mcpManager))
    .addNode('generateAudio', async (state) => generateAudioNode(state as JiraAudioQuoteState, mcpManager))
    .addNode('downloadAudio', async (state) => downloadAudioNode(state as JiraAudioQuoteState, mcpManager))
    // Set entry point with conditional routing for resume
    .addConditionalEdges(
      START,
      (state: any) => {
        // If resuming, skip to processQuote
        if (state.resuming && state.quote) {
          return 'processQuote';
        }
        // Otherwise start with generatePrompt
        return 'generatePrompt';
      },
      // Explicitly map possible destinations
      {
        generatePrompt: 'generatePrompt',
        processQuote: 'processQuote'
      }
    )
    // After generatePrompt, it returns PartialWorkflowResult which will end
    .addEdge('generatePrompt', END)
    // After processQuote, go to generateAudio
    .addEdge('processQuote', 'generateAudio')
    // After generateAudio, go to downloadAudio
    .addEdge('generateAudio', 'downloadAudio')
    // After downloadAudio, end
    .addEdge('downloadAudio', END);

  return workflow.compile();
}

/**
 * Workflow definition
 */
export const jiraAudioQuoteWorkflow: WorkflowDefinition = {
  id: 'create_jira_with_audio_quote',
  name: 'Create Jira Ticket with Audio Quote',
  description: 'Creates a Jira ticket with a Bradley Plum quote and generates mystical audio narration for it',
  version: '1.0.0',
  requirements: workflowConfig,
  inputSchema,
  outputSchema,
  createGraph
};
