/**
 * Audio Quote and Append Workflow State
 * Step 2: Enhance quote, generate audio, and attach to Jira ticket
 */

export interface AudioQuoteAppendState {
  // Input - from ticket creation
  ticketKey: string;
  ticketUrl: string;
  quote: string;
  projectKey: string;
  context?: string;

  // Workflow tracking
  currentStep: string;
  completedSteps: string[];

  // Processing
  enhancedQuote?: string;
  voiceDirections?: string;
  audioId?: string;
  audioPath?: string;

  // Output - Playwright instructions
  atlassianPrompt?: string;

  // Error tracking
  error?: string;
  errors?: Array<{ step: string; error: string }>;
}
