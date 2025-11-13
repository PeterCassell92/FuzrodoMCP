/**
 * Generate Atlassian prompt and pause for Claude to create ticket
 */

import { MCPClientManager } from '../../utils/mcpClient';
import { logger } from '../../utils/logger';

/**
 * Generate prompt using Atlassian prompts MCP
 */
export async function generatePromptNode(
  state: any,
  mcpManager: MCPClientManager
): Promise<any> {
  try {
    logger.info('Generating Atlassian prompt for Jira ticket creation');

    // Call atlassian-prompts MCP to generate the prompt
    const result = await mcpManager.callTool(
      'atlassian-prompts',
      'generate_prompt',
      {
        template: 'jira-create-issue',
        substitutions: {
          SUMMARY: state.summary,
          DESCRIPTION: state.description,
          PROJECT_KEY: state.projectKey,
          ISSUE_TYPE: 'Task',
          PRIORITY: 'Medium',
          PARENT_EPIC: 'FEDS-1812',
          ADDITIONAL_DETAILS: ''
        }
      }
    );

    // Extract prompt text from MCP result
    // MCP SDK wraps results in {content: [{type: 'text', text: '...'}]}
    let promptText: string;
    if (typeof result === 'string') {
      promptText = result;
    } else if (result.content && Array.isArray(result.content) && result.content[0]?.text) {
      promptText = result.content[0].text;
    } else {
      logger.error('Unexpected result format from Atlassian MCP', {
        resultType: typeof result,
        resultKeys: Object.keys(result)
      });
      throw new Error('Could not extract prompt from Atlassian MCP response');
    }

    logger.info('Atlassian prompt generated successfully', {
      promptLength: promptText.length
    });

    // Return the prompt directly - no pause/resume needed
    return {
      currentStep: 'completed',
      completedSteps: [...state.completedSteps, 'generatePrompt'],
      atlassianPrompt: promptText
    };
  } catch (error) {
    logger.error('Failed to generate Atlassian prompt', { error });

    return {
      currentStep: 'error',
      error: `Failed to generate prompt: ${(error as Error).message}`,
      errors: [
        ...(state.errors || []),
        {
          step: 'generatePrompt',
          error: (error as Error).message
        }
      ]
    };
  }
}
