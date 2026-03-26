import { CodeAnalysis } from './CodeAnalyzer.js';
import { ArchitectureAnalysis } from './ArchitectureExtractor.js';
import { createLLMClient, getDefaultModel, isLocalProvider } from '../llm/client.js';

export interface CompetitiveReport {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  marketImpact: string;
  recommendation: string;
}

export class CompetitiveReportGenerator {
  private llm: ReturnType<typeof createLLMClient>;

  constructor() {
    this.llm = createLLMClient();
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
      const response = await this.llm.chat.completions.create({
        model: getDefaultModel(),
        messages: [
          {
            role: 'system',
            content: `You are a competitive intelligence analyst for RRDA, a research and analysis platform focused on developer tools, AI software systems, and engineering automation.
Analyze the project and assess its market relevance, strengths, weaknesses, and why it matters.
Respond in JSON format with: summary, strengths (array), weaknesses (array), marketImpact, recommendation.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        ...(isLocalProvider() ? {} : { response_format: { type: 'json_object' as const } }),
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(this.cleanJsonResponse(content));
      return {
        summary: parsed.summary || 'Analysis unavailable',
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        marketImpact: parsed.marketImpact || 'Unknown',
        recommendation: parsed.recommendation || 'Monitor',
      };

    } catch (error: any) {
      console.log(`  ⚠️  AI analysis failed: ${error.message}`);
      return {
        summary: `Code analysis of ${title}: ${codeAnalysis.totalLOC} LOC across ${Object.keys(codeAnalysis.languages).length} languages. ${archAnalysis.architecturePattern} architecture.`,
        strengths: archAnalysis.frameworks.map(f => `Uses ${f}`),
        weaknesses: [],
        marketImpact: 'Unable to assess — AI analysis failed',
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

Assess this project’s market impact and provide your analysis as JSON.
`.trim();
  }

  private cleanJsonResponse(content: string): string {
    const withoutFences = content.replace(/```json|```/gi, '').trim();
    const firstBrace = withoutFences.indexOf('{');
    const lastBrace = withoutFences.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return withoutFences.slice(firstBrace, lastBrace + 1);
    }

    return withoutFences;
  }
}
