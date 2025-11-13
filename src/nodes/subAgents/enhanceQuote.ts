/**
 * Sub-agent for enhancing quotes for audio impact
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../../utils/logger';

export interface EnhanceQuoteInput {
  quote: string;
  context?: string; // Optional context like theme or mood
}

export interface EnhanceQuoteOutput {
  enhancedQuote: string;
  voiceDirections: string;
  reasoning: string;
}

/**
 * Enhance a quote for audio impact using a sub-agent
 * This is a self-contained task that doesn't need conversation context
 */
export async function enhanceQuoteForAudio(
  input: EnhanceQuoteInput
): Promise<EnhanceQuoteOutput> {
  logger.info('Spawning sub-agent to enhance quote for audio', {
    quoteLength: input.quote.length
  });

  // Initialize OpenAI via LangChain
  const model = new ChatOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    temperature: 0.7, // Allow creativity for enhancement
    apiKey: process.env.OPENAI_API_KEY
  });

  // System prompt defines the sub-agent's behavior
  const systemPrompt = `You are a mystical quote enhancement specialist for text-to-speech audio.

Your task is to:
1. Enhance quotes for maximum audio impact using a wise, contemplative tone
2. Add subtle voice directions for ElevenLabs TTS (use [pause] for dramatic pauses)
3. Maintain the essence and wisdom of the original quote
4. Keep enhancements natural and not over-the-top

Voice Direction Guidelines:
- Use [pause] for dramatic effect (sparingly - 1-2 times max)
- Add slight emphasis to key words (e.g., "In the *shadows* we find...")
- Ensure flow and rhythm for spoken delivery
- Maintain a mystical, philosophical tone like a japanese mystic from an anime

Here's an example of a nicely formatted quote with some direction:
[Dramatically] Documentation is the bridge [breathes] between the architect's vision [emphasized]
and the craftsman's execution. [pause] When the path is clearly marked, [deliberate] even complex journeys become navigable, and knowledge flows freely from one mind [continues after a beat] to another.

Output Format (JSON):
{
  "enhancedQuote": "The improved quote with [pause] markers",
  "voiceDirections": "Brief notes on tone and emphasis",
  "reasoning": "Why these enhancements improve audio impact"
}`;

  const userPrompt = input.context
    ? `Enhance this quote (context: ${input.context}):\n\n"${input.quote}"`
    : `Enhance this quote:\n\n"${input.quote}"`;

  try {
    // Invoke the sub-agent
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    // Parse JSON response
    const content = response.content.toString();

    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    const result = JSON.parse(jsonStr);

    logger.info('Sub-agent successfully enhanced quote', {
      originalLength: input.quote.length,
      enhancedLength: result.enhancedQuote.length
    });

    return {
      enhancedQuote: result.enhancedQuote,
      voiceDirections: result.voiceDirections,
      reasoning: result.reasoning
    };
  } catch (error) {
    logger.error('Sub-agent failed to enhance quote', { error });

    // Fallback: return original quote with basic pause
    return {
      enhancedQuote: `${input.quote} [pause]`,
      voiceDirections: 'Use contemplative, wise tone',
      reasoning: 'Sub-agent error - using original quote with minimal enhancement'
    };
  }
}
