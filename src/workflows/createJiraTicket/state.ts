/**
 * Create Jira Ticket Workflow State
 * Step 1: Generate prompt for Claude to create ticket via Playwright
 */

export interface CreateJiraTicketState {
  // Input
  summary: string;
  description: string;
  projectKey: string;
  context?: string;

  // Workflow tracking
  currentStep: string;
  completedSteps: string[];

  // Output - instructions for Claude
  atlassianPrompt?: string;
  nextWorkflow?: string;
  nextWorkflowDescription?: string;

  // Error tracking
  error?: string;
  errors?: Array<{ step: string; error: string }>;
}
