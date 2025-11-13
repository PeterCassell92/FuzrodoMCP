/**
 * Process quote using sub-agent for enhancement
 */

import { MCPClientManager } from '../../utils/mcpClient';
import { JiraAudioQuoteState } from '../../workflows/jiraAudioQuote/state';
import { logger } from '../../utils/logger';
import { enhanceQuoteForAudio } from '../subAgents/enhanceQuote';

/**
 * Enhance the quote for audio impact using sub-agent
 */
export async function processQuoteNode(
  state: JiraAudioQuoteState,
  mcpManager: MCPClientManager
): Promise<Partial<JiraAudioQuoteState>> {
  try {
    if (!state.quote) {
      throw new Error('Quote is required but not provided');
    }

    logger.info('Processing quote with sub-agent', {
      quoteLength: state.quote.length
    });

    // Call sub-agent to enhance quote
    const enhanced = await enhanceQuoteForAudio({
      quote: state.quote,
      context: state.context || 'mystical, contemplative'
    });

    logger.info('Quote enhanced successfully', {
      enhancedLength: enhanced.enhancedQuote.length,
      voiceDirections: enhanced.voiceDirections
    });

    return {
      currentStep: 'generateAudio',
      completedSteps: [...state.completedSteps, 'processQuote'],
      enhancedQuote: enhanced.enhancedQuote,
      voiceDirections: enhanced.voiceDirections
    };
  } catch (error) {
    logger.error('Failed to process quote', { error });

    return {
      currentStep: 'error',
      error: `Failed to process quote: ${(error as Error).message}`,
      errors: [
        ...(state.errors || []),
        {
          step: 'processQuote',
          error: (error as Error).message
        }
      ]
    };
  }
}
