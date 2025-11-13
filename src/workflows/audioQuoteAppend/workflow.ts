/**
 * Audio Quote and Append Workflow
 * Enhances quote, generates audio, and provides instructions to attach to Jira
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { AudioQuoteAppendState } from './state';
import { WorkflowDefinition } from '../../types/workflow';
import { workflowConfig, inputSchema, outputSchema } from './config';
import { MCPClientManager } from '../../utils/mcpClient';

// Import nodes
import { processQuoteNode } from '../../nodes/jira/processQuote';
import { generateAudioNode } from '../../nodes/audio/generateAudio';
import { downloadAudioNode } from '../../nodes/audio/downloadAudio';
import { generateFileAttachmentPromptNode } from '../../nodes/jira/generateFileAttachmentPrompt';

/**
 * Create the workflow graph
 */
function createGraph() {
  const mcpManager = new MCPClientManager();

  // Define state annotation with proper reducers
  const StateAnnotation = Annotation.Root({
    currentStep: Annotation<string>({
      reducer: (left, right) => right ?? left,
      default: () => 'start'
    }),
    completedSteps: Annotation<string[]>({
      reducer: (left, right) => right ?? left,
      default: () => []
    }),
    ticketKey: Annotation<string>({
      reducer: (left, right) => right ?? left
    }),
    ticketUrl: Annotation<string>({
      reducer: (left, right) => right ?? left
    }),
    quote: Annotation<string>({
      reducer: (left, right) => right ?? left
    }),
    projectKey: Annotation<string>({
      reducer: (left, right) => right ?? left
    }),
    context: Annotation<string | undefined>({
      reducer: (left, right) => right ?? left
    }),
    enhancedQuote: Annotation<string | undefined>({
      reducer: (left, right) => right ?? left
    }),
    voiceDirections: Annotation<string | undefined>({
      reducer: (left, right) => right ?? left
    }),
    audioId: Annotation<string | undefined>({
      reducer: (left, right) => right ?? left
    }),
    audioPath: Annotation<string | undefined>({
      reducer: (left, right) => right ?? left
    }),
    atlassianPrompt: Annotation<string | undefined>({
      reducer: (left, right) => right ?? left
    }),
    error: Annotation<string | undefined>({
      reducer: (left, right) => right ?? left
    }),
    errors: Annotation<Array<{ step: string; error: string }>>({
      reducer: (left, right) => right ?? left,
      default: () => []
    }),
  });

  // Linear workflow: processQuote -> generateAudio -> downloadAudio -> generateFileAttachmentPrompt
  const workflow = new StateGraph(StateAnnotation)
    .addNode('processQuote', async (state) =>
      processQuoteNode(state as any, mcpManager)
    )
    .addNode('generateAudio', async (state) =>
      generateAudioNode(state as any, mcpManager)
    )
    .addNode('downloadAudio', async (state) =>
      downloadAudioNode(state as any, mcpManager)
    )
    .addNode('generateFileAttachmentPrompt', async (state) =>
      generateFileAttachmentPromptNode(state as any, mcpManager)
    )
    .addEdge(START, 'processQuote')
    .addEdge('processQuote', 'generateAudio')
    .addEdge('generateAudio', 'downloadAudio')
    .addEdge('downloadAudio', 'generateFileAttachmentPrompt')
    .addEdge('generateFileAttachmentPrompt', END);

  return workflow.compile();
}

/**
 * Workflow definition
 */
export const audioQuoteAppendWorkflow: WorkflowDefinition = {
  id: 'create_audio_quote_and_append_to_ticket',
  name: 'Create Audio Quote and Append to Ticket',
  description:
    'Enhances Bradley Plum quote with OpenAI, generates mystical audio narration with ElevenLabs, downloads audio file, and generates Playwright instructions to attach it to the Jira ticket',
  version: '1.0.0',
  requirements: workflowConfig,
  inputSchema,
  outputSchema,
  createGraph,
};
