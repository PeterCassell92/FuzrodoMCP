/**
 * Generate Playwright instructions for attaching file to Jira ticket
 */

import { MCPClientManager } from '../../utils/mcpClient';
import { AudioQuoteAppendState } from '../../workflows/audioQuoteAppend/state';
import { logger } from '../../utils/logger';

/**
 * Generate prompt for attaching audio file to Jira ticket
 */
export async function generateFileAttachmentPromptNode(
  state: AudioQuoteAppendState,
  mcpManager: MCPClientManager
): Promise<Partial<AudioQuoteAppendState>> {
  try {
    if (!state.audioPath) {
      throw new Error('Audio file path is required but not provided');
    }

    if (!state.ticketKey) {
      throw new Error('Ticket key is required but not provided');
    }

    logger.info('Generating file attachment prompt', {
      ticketKey: state.ticketKey,
      audioPath: state.audioPath
    });

    // Call Atlassian Prompts MCP to generate the prompt
    const result = await mcpManager.callTool(
      'atlassian-prompts',
      'generate_prompt',
      {
        template: 'jira-append-file',
        substitutions: {
          TICKET_ID: state.ticketKey,
          FILE_PATHS: `  - ${state.audioPath}`
        }
      }
    );

    // Extract prompt from MCP SDK response
    let promptText: string;
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) {
        promptText = textContent.text;
      } else {
        throw new Error('No text content in Atlassian Prompts response');
      }
    } else if (typeof result === 'string') {
      promptText = result;
    } else {
      throw new Error('Unexpected response format from Atlassian Prompts');
    }

    logger.info('File attachment prompt generated successfully', {
      promptLength: promptText.length
    });

    // Return the prompt - workflow will return this to Claude for execution
    return {
      currentStep: 'completed',
      completedSteps: [...state.completedSteps, 'generateFileAttachmentPrompt'],
      atlassianPrompt: promptText,
      // Preserve all fields for output
      ticketKey: state.ticketKey,
      ticketUrl: state.ticketUrl,
      quote: state.quote,
      projectKey: state.projectKey,
      context: state.context,
      enhancedQuote: state.enhancedQuote,
      voiceDirections: state.voiceDirections,
      audioId: state.audioId,
      audioPath: state.audioPath
    };
  } catch (error) {
    logger.error('Failed to generate file attachment prompt', { error });

    return {
      currentStep: 'error',
      error: `Failed to generate file attachment prompt: ${(error as Error).message}`,
      errors: [
        ...(state.errors || []),
        {
          step: 'generateFileAttachmentPrompt',
          error: (error as Error).message
        }
      ]
    };
  }
}
