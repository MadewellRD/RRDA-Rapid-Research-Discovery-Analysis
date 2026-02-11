import OpenAI from 'openai';
import { CodeAnalysis } from './CodeAnalyzer.js';
import { ArchitectureAnalysis } from './ArchitectureExtractor.js';

export interface CompetitiveReport {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  threatToForge: string;
  recommendation: string;
}

export class CompetitiveReportGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate AI-powered competitive analysis
   */
  async generate(
    title: string,
    description: string,
    codeAnalysis: CodeAnalysis,
    archAnalysis: ArchitectureAnalysis,
    readmeContent?: string
  ): Promise<CompetitiveReport> {
    const prompt = this.buildPrompt(title, description, codeAnalysis, archAnalysis, readmeContent);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a competitive intelligence analyst for FORGE, an autonomous software development platform.
FORGE has 24 specialized AI agents that autonomously generate production-ready code across the full SDLC.
FORGE's key differentiators: 11 governance heuristics, legacy migration (10 languages), $0.02/project cost.
Analyze the competitor and assess their threat to FORGE's market position.
Respond in JSON format with: summary, strengths (array), weaknesses (array), threatToForge, recommendation.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content);
      return {
        summary: parsed.summary || 'Analysis unavailable',
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        threatToForge: parsed.threatToForge || 'Unknown',
        recommendation: parsed.recommendation || 'Monitor',
      };

    } catch (error: any) {
      console.log(`  ⚠️  AI analysis failed: ${error.message}`);
      return {
        summary: `Code analysis of ${title}: ${codeAnalysis.totalLOC} LOC across ${Object.keys(codeAnalysis.languages).length} languages. ${archAnalysis.architecturePattern} architecture.`,
        strengths: archAnalysis.frameworks.map(f => `Uses ${f}`),
        weaknesses: [],
        threatToForge: 'Unable to assess — AI analysis failed',
        recommendation: 'Manual review required',
      };
    }
  }

  private buildPrompt(
    title: string,
    description: string,
    code: CodeAnalysis,
    arch: ArchitectureAnalysis,
    readme?: string
  ): string {
    // Sort languages by LOC
    const langBreakdown = Object.entries(code.languages)
      .sort(([, a], [, b]) => b - a)
      .map(([lang, loc]) => `  ${lang}: ${loc.toLocaleString()} lines`)
      .join('\n');

    return `
## Competitor: ${title}
${description ? `Description: ${description}` : ''}

## Code Analysis
Total Lines of Code: ${code.totalLOC.toLocaleString()}
Files: ${code.fileCount}
Languages:
${langBreakdown}

## Architecture
Pattern: ${arch.architecturePattern}
Frameworks: ${arch.frameworks.join(', ') || 'None detected'}
CI/CD: ${arch.hasCICD ? 'Yes' : 'No'}
Tests: ${arch.hasTests ? 'Yes' : 'No'}
Docker: ${arch.hasDocker ? 'Yes' : 'No'}
AI/LLM Dependencies: ${arch.hasAIDeps ? 'Yes' : 'No'}
Total Dependencies: ${arch.dependencyCount}
Build Tools: ${arch.buildTools.join(', ') || 'None detected'}

## Key Signals
${arch.signals.map(s => `- ${s}`).join('\n')}

${readme ? `## README (first 2000 chars)\n${readme.substring(0, 2000)}` : ''}

Analyze this competitor's threat to FORGE and provide your assessment as JSON.
`.trim();
  }
}
