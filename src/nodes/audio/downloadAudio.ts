/**
 * Download audio file from ElevenLabs
 */

import { MCPClientManager } from '../../utils/mcpClient';
import { JiraAudioQuoteState } from '../../workflows/jiraAudioQuote/state';
import { logger } from '../../utils/logger';
import * as path from 'path';
import * as os from 'os';

/**
 * Download audio file using ElevenLabs MCP
 */
export async function downloadAudioNode(
  state: JiraAudioQuoteState,
  mcpManager: MCPClientManager
): Promise<Partial<JiraAudioQuoteState>> {
  try {
    if (!state.audioId) {
      throw new Error('Audio ID is required but not provided');
    }

    if (!state.ticketKey) {
      throw new Error('Ticket key is required but not provided');
    }

    // Generate output path in temp directory
    const outputPath = path.join(
      os.tmpdir(),
      `jira-${state.ticketKey}-quote.mp3`
    );

    logger.info('Downloading audio file', {
      audioId: state.audioId,
      outputPath
    });

    // Call ElevenLabs MCP to download audio
    await mcpManager.callTool(
      'elevenlabs',
      'download_audio',
      {
        audio_id: state.audioId,
        output_path: outputPath
      }
    );

    logger.info('Audio downloaded successfully', {
      audioPath: outputPath
    });

    // Return complete state for final output
    return {
      currentStep: 'completed',
      completedSteps: [...state.completedSteps, 'downloadAudio'],
      audioPath: outputPath,
      // Preserve fields for output
      ticketKey: state.ticketKey,
      ticketUrl: state.ticketUrl,
      quote: state.quote,
      projectKey: state.projectKey,
      context: state.context,
      enhancedQuote: state.enhancedQuote,
      voiceDirections: state.voiceDirections,
      audioId: state.audioId
    };
  } catch (error) {
    logger.error('Failed to download audio', { error });

    return {
      currentStep: 'error',
      error: `Failed to download audio: ${(error as Error).message}`,
      errors: [
        ...(state.errors || []),
        {
          step: 'downloadAudio',
          error: (error as Error).message
        }
      ]
    };
  }
}
