/**
 * Configuration loader
 * This MUST be imported before any other modules to ensure
 * environment variables are loaded before they are accessed
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');

// Load .env file from FuzroDo's directory (not current working directory)
config({ path: envPath });

// Log that config was loaded
if (process.env.LOG_LEVEL === 'debug') {
  console.error('[FuzroDo] Loaded .env from:', envPath);
  console.error('[FuzroDo] MCP servers configured:',
    Object.keys(process.env).filter(k => k.includes('MCP_TRANSPORT')));
}
