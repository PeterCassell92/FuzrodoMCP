/**
 * Generate audio using ElevenLabs
 */

import { MCPClientManager } from '../../utils/mcpClient';
import { JiraAudioQuoteState } from '../../workflows/jiraAudioQuote/state';
import { logger } from '../../utils/logger';

/**
 * Generate audio file using ElevenLabs MCP
 */
export async function generateAudioNode(
  state: JiraAudioQuoteState,
  mcpManager: MCPClientManager
): Promise<Partial<JiraAudioQuoteState>> {
  try {
    if (!state.enhancedQuote) {
      throw new Error('Enhanced quote is required but not provided');
    }

    logger.info('Generating audio with ElevenLabs', {
      textLength: state.enhancedQuote.length
    });

    // Call ElevenLabs MCP to create audio
    const result = await mcpManager.callTool(
      'elevenlabs',
      'create_wise_quote_audio',
      {
        text: state.enhancedQuote,
        // Use default voice and settings from ElevenLabs MCP
      }
    );

    logger.debug('ElevenLabs result structure', {
      resultKeys: Object.keys(result),
      resultType: typeof result,
      hasContent: !!result.content,
      result: JSON.stringify(result, null, 2)
    });

    // Extract audio_id from result - handle MCP SDK wrapper format
    let audioId: string | undefined;

    // Try direct property access
    if (result.audio_id) {
      audioId = result.audio_id;
    } else if (result.audioId) {
      audioId = result.audioId;
    }
    // Try MCP SDK content wrapper
    else if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) {
        try {
          const parsed = JSON.parse(textContent.text);
          audioId = parsed.audio_id || parsed.audioId;
        } catch {
          // Not JSON, might be plain text
        }
      }
    }

    if (!audioId) {
      logger.error('No audio_id in ElevenLabs response', {
        result,
        resultKeys: Object.keys(result)
      });
      throw new Error('ElevenLabs did not return an audio_id');
    }

    logger.info('Audio generated successfully', {
      audioId
    });

    return {
      currentStep: 'downloadAudio',
      completedSteps: [...(state.completedSteps || []), 'generateAudio'],
      audioId
    };
  } catch (error) {
    logger.error('Failed to generate audio', { error });

    return {
      currentStep: 'error',
      error: `Failed to generate audio: ${(error as Error).message}`,
      errors: [
        ...(state.errors || []),
        {
          step: 'generateAudio',
          error: (error as Error).message
        }
      ]
    };
  }
}
