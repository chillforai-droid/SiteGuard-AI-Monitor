import axios from 'axios';
import { config } from '../config.js';

export class AIAnalyzer {
  constructor(openRouterKey = '', selectedModel = '') {
    this.apiKey = openRouterKey || config.openRouterApiKey;
    this.baseUrl = config.openRouterBaseUrl;
    this.currentModelIndex = 0;
    this.userSelectedModel = selectedModel || '';
  }

  get model() {
    if (this.userSelectedModel) return this.userSelectedModel;
    return config.freeModels[this.currentModelIndex] || config.freeModels[0];
  }

  async analyzeIssues(scanResults, website, retryCount = 0) {
    if (!this.apiKey) {
      console.warn('No OpenRouter API key — using basic analysis');
      return this.generateBasicAnalysis(scanResults);
    }

    const prompt = this.buildAnalysisPrompt(scanResults, website);

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert web developer and bug analyzer. Analyze website issues and provide actionable fixes. Always respond with valid JSON only.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ai-website-monitor.app',
            'X-Title': 'AI Website Monitor'
          },
          timeout: 30000
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      return this.parseAIResponse(aiResponse);

    } catch (err) {
      console.error(`AI Analysis failed (model: ${this.model}):`, err.message);

      if (retryCount === 0 && this.currentModelIndex < config.freeModels.length - 1) {
        this.currentModelIndex += 1;
        console.log(`Retrying with model: ${this.model}`);
        return this.analyzeIssues(scanResults, website, retryCount + 1);
      }

      this.currentModelIndex = 0;
      return this.generateBasicAnalysis(scanResults);
    }
  }

  buildAnalysisPrompt(scanResults, website) {
    const errorsText = scanResults.errors.length > 0
      ? scanResults.errors.map((e, i) => `${i + 1}. ${e.type}: ${e.message}`).join('\n')
      : 'None';

    const warningsText = scanResults.warnings.length > 0
      ? scanResults.warnings.map((w, i) => `${i + 1}. ${w.type}: ${w.message}`).join('\n')
      : 'None';

    return `Analyze this website for issues and respond ONLY with valid JSON (no markdown, no explanation):

URL: ${website.url}
Framework: ${website.framework || 'Unknown'}
Last Scanned: ${scanResults.timestamp}

Errors Found:
${errorsText}

Warnings:
${warningsText}

Performance Scores:
${JSON.stringify(scanResults.lighthouse?.scores || {}, null, 2)}

Respond with this exact JSON structure:
{
  "criticalIssues": [{"type": "string", "message": "string", "severity": "error|warning"}],
  "rootCauses": ["string"],
  "affectedFiles": ["string"],
  "patches": [{"file": "string", "fix": "string", "risk": "low|medium|high"}],
  "priority": "high|medium|low",
  "summary": "string"
}`;
  }

  parseAIResponse(response) {
    try {
      const cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.log('Failed to parse AI response as JSON, using basic analysis');
    }

    return {
      criticalIssues: [],
      rootCauses: [],
      affectedFiles: [],
      patches: [],
      priority: 'medium',
      summary: response
    };
  }

  generateBasicAnalysis(scanResults) {
    const analysis = {
      criticalIssues: [],
      rootCauses: [],
      affectedFiles: [],
      patches: [],
      priority: 'medium',
      summary: 'Basic analysis (AI unavailable — add your OpenRouter API key in Settings)'
    };

    scanResults.errors.forEach(error => {
      analysis.criticalIssues.push({
        type: error.type,
        message: error.message,
        severity: 'error'
      });
    });

    if (scanResults.warnings.length > 0) analysis.priority = 'high';

    if (scanResults.seo?.warnings?.some(w => w.message.includes('Missing: Title tag'))) {
      analysis.patches.push({ file: 'index.html', fix: 'Add <title>Your Website Title</title> inside <head>', risk: 'low' });
    }
    if (scanResults.seo?.warnings?.some(w => w.message.includes('Missing: Meta description'))) {
      analysis.patches.push({ file: 'index.html', fix: 'Add <meta name="description" content="Your description"> inside <head>', risk: 'low' });
    }
    if (scanResults.seo?.warnings?.some(w => w.message.includes('Missing: Viewport meta'))) {
      analysis.patches.push({ file: 'index.html', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> inside <head>', risk: 'low' });
    }

    return analysis;
  }

  async generateFixCode(issue, websiteInfo) {
    if (!this.apiKey) {
      return { fix: '// OpenRouter API key not set — add it in Settings', model: 'none' };
    }

    const prompt = `Generate a code fix for this issue:

Website: ${websiteInfo.url}
Framework: ${websiteInfo.framework || 'Unknown'}
Issue Type: ${issue.type}
Issue Message: ${issue.message}

Provide the exact code changes needed using diff format:
\`\`\`diff
- old code
+ new code
\`\`\`

Include: file path, brief explanation, risk level (low/medium/high), and testing steps.`;

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 1500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ai-website-monitor.app',
            'X-Title': 'AI Website Monitor'
          },
          timeout: 30000
        }
      );

      return {
        fix: response.data.choices[0].message.content,
        model: this.model
      };
    } catch (err) {
      console.error('Fix code generation failed:', err.message);
      return { fix: '// AI fix generation failed — check your OpenRouter API key in Settings', model: 'none' };
    }
  }
}
