import dotenv from 'dotenv';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { GitHubScanner } from '../scanners/GitHubScanner.js';
import { Discovery, IntelligenceLevel } from '../types/index.js';
import { getPool } from '../database/pool.js';

// Load env vars
dotenv.config();

export class RDACore {
  private pool: Pool;
  private openai: OpenAI;
  private githubScanner: GitHubScanner;

  constructor() {
    // Shared database pool
    this.pool = getPool();

    // OpenAI for intelligence analysis
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // GitHub scanner
    this.githubScanner = new GitHubScanner();

    console.log('🤖 RDA Core initialized');
  }

  async assessIntelligence(discovery: Discovery): Promise<IntelligenceLevel> {
    console.log(`🔍 Assessing: ${discovery.title}`);

    const prompt = `You are MadewellRD's Research & Development Agent (RDA). Assess this discovery's strategic value.

Discovery:
Source: ${discovery.source}
Title: ${discovery.title}
Description: ${discovery.description || 'N/A'}
URL: ${discovery.url}
Stars: ${discovery.stars || 0}
Metadata: ${JSON.stringify(discovery.metadata, null, 2)}

MadewellRD's Core Business:
- FORGE: Autonomous software development platform with 24 specialized agents
- Legacy system modernization (COBOL, FORTRAN → Modern languages)
- AI-powered code generation
- Target market: Enterprise software development automation

Assess this discovery on:
1. Competitive Threat (0-10): How much does this threaten FORGE?
2. Opportunity Value (0-10): How valuable is this for us?
3. Intelligence Level: CRITICAL, HIGH, MEDIUM, LOW, or NOISE
4. Recommended Action: What should we do?

CRITICAL = Direct competitor or game-changing opportunity
HIGH = Relevant technology or significant opportunity
MEDIUM = Interesting, worth monitoring
LOW = Tangentially relevant
NOISE = Irrelevant

Respond with valid JSON (no markdown):
{
  "level": "HIGH",
  "threatScore": 7.5,
  "opportunityScore": 8.0,
  "reasoning": "This is a novel approach to X that could be integrated into FORGE's Y agent...",
  "recommendedAction": "Clone repo and analyze architecture for potential integration",
  "shouldAnalyzeDeep": true
}`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    let content = completion.choices[0].message.content!;
    content = this.cleanJsonResponse(content);

    const tokens = completion.usage?.total_tokens || 0;
    const cost = (tokens * 0.00000015).toFixed(6);
    console.log(`   💰 Assessment cost: $${cost}`);

    return JSON.parse(content);
  }

  async storeDiscovery(discovery: Discovery, assessment: IntelligenceLevel): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO discoveries
       (source, source_id, url, title, description, stars, forks,
        intelligence_level, threat_score, opportunity_score, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (source, url)
       DO UPDATE SET
         stars = EXCLUDED.stars,
         intelligence_level = EXCLUDED.intelligence_level,
         threat_score = EXCLUDED.threat_score,
         opportunity_score = EXCLUDED.opportunity_score,
         last_checked = NOW()
       RETURNING id`,
      [
        discovery.source,
        discovery.sourceId || discovery.url,
        discovery.url,
        discovery.title,
        discovery.description,
        discovery.stars || 0,
        discovery.forks || 0,
        assessment.level,
        assessment.threatScore,
        assessment.opportunityScore,
        JSON.stringify(discovery.metadata || {}),
      ]
    );

    return result.rows[0].id;
  }

  async performFullScan(): Promise<void> {
    console.log('🚀 RDA Full Scan Starting...');
    console.log('='.repeat(60));

    const keywords = [
      'autonomous development',
      'code generation',
      'AI agents',
      'legacy migration',
      'COBOL modernization',
    ];

    const discoveries = await this.githubScanner.searchByKeywords(keywords, 100);
    console.log(`\n📊 Found ${discoveries.length} repositories to analyze\n`);

    let criticalCount = 0;
    let highCount = 0;

    for (let i = 0; i < discoveries.length; i++) {
      const discovery = discoveries[i];
      console.log(`\n[${i + 1}/${discoveries.length}] ${discovery.title}`);

      try {
        const assessment = await this.assessIntelligence(discovery);
        const discoveryId = await this.storeDiscovery(discovery, assessment);

        console.log(`   📊 Level: ${assessment.level}`);
        console.log(`   ⚠️  Threat: ${assessment.threatScore}/10`);
        console.log(`   💡 Opportunity: ${assessment.opportunityScore}/10`);
        console.log(`   💾 Stored as ID: ${discoveryId}`);

        if (assessment.level === 'CRITICAL') criticalCount++;
        if (assessment.level === 'HIGH') highCount++;

        await this.sleep(2000);

      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎯 RDA Scan Complete!');
    console.log('='.repeat(60));
    console.log(`📊 Total Analyzed: ${discoveries.length}`);
    console.log(`🚨 Critical Threats: ${criticalCount}`);
    console.log(`⚠️  High Priority: ${highCount}`);
    console.log('='.repeat(60));
  }

  private cleanJsonResponse(content: string): string {
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```\s*$/, '');
    return cleaned.trim();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
