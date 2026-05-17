import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  // Anthropic Claude API (primary — most reliable for AI edits)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  // OpenRouter (fallback)
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterBaseUrl: 'https://openrouter.ai/api/v1',
  freeModels: [
    'deepseek/deepseek-chat:free',
    'deepseek/deepseek-r1:free',
    'google/gemini-2.0-flash-exp:free'
  ],
  githubToken: process.env.GITHUB_TOKEN || '',
  // monitorApiKey: user sets this in Settings UI, sent via x-api-key header
  monitorApiKey: process.env.MONITOR_API_KEY || '',
  dataDir: './server/data',
  scanInterval: process.env.SCAN_INTERVAL || '0 * * * *',
  maxRetries: 3,
  playwrightOptions: {
    headless: true,
    timeout: 30000
  }
};
