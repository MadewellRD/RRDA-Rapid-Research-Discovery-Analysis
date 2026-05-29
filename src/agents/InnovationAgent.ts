/**
 * Innovation Agent
 * 
 * Synthesizes recent intelligence into candidate product ideas.
 * Instead of cloning discovered projects, it synthesizes trends
 * and identifies GAPS — things that don't exist yet but should.
 * 
 * Runs every 20 minutes:
 *   1. Pull recent discoveries from RDA database
 *   2. Cluster by theme/technology  
 *   3. Creative synthesis — identify gaps, unserved needs, novel combinations
 *   4. Generate original project proposal
 *   5. Novelty check
 *   6. Store proposal for review
 * 
 * This is the "product visionary" in the autonomous software team.
 */
import { getPool } from '../database/pool.js';
import { SlackNotifier } from '../notifiers/SlackNotifier.js';
import { createLLMClient, getDefaultModel, getCreativeModel } from '../llm/client.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface ProjectProposal {
  id?: number;
  name: string;
  concept: string;
  problemStatement: string;
  inspirationSources: string[];
  targetUsers: string;
  capabilities: string[];
  noveltyScore: number;
  reasoning: string;
  status: 'proposed' | 'in_review' | 'accepted' | 'archived';
  createdAt?: Date;
}

interface DiscoveryCluster {
  theme: string;
  discoveries: Array<{
    title: string;
    description: string;
    source: string;
    stars?: number;
    upvotes?: number;
    url: string;
  }>;
  trendSignal: string;
}

// ─── Agent ──────────────────────────────────────────────────────────

export class InnovationAgent {
  private llm: ReturnType<typeof createLLMClient>;
  private slack: SlackNotifier;
  private model: string;
  private creativeModel: string;
  private lastRunAt: Date | null = null;

  constructor() {
    this.llm = createLLMClient();
    this.slack = new SlackNotifier();
    this.model = getDefaultModel();
    this.creativeModel = getCreativeModel();
  }

  // ─── Main Loop ──────────────────────────────────────────────────

  /**
   * Single innovation cycle. Called every 20 minutes.
   */
  async run(): Promise<ProjectProposal | null> {
    const cycleStart = Date.now();
    console.log('\n' + '='.repeat(70));
    console.log('INNOVATION AGENT — Creative Synthesis Cycle');
    console.log('='.repeat(70));

    try {
      // 1. Gather recent intelligence
      const lookbackHours = this.lastRunAt 
        ? Math.max(1, (Date.now() - this.lastRunAt.getTime()) / 3600000)
        : 24; // First run: look back 24h
      
      const discoveries = await this.getRecentDiscoveries(Math.ceil(lookbackHours));
      console.log(`[INTEL] ${discoveries.length} discoveries in last ${Math.ceil(lookbackHours)}h`);

      if (discoveries.length < 3) {
        console.log('[INTEL] Insufficient data for synthesis — waiting for more intelligence');
        this.lastRunAt = new Date();
        return null;
      }

      // 2. Cluster by theme
      const clusters = await this.clusterDiscoveries(discoveries);
      console.log(`[CLUSTER] ${clusters.length} thematic clusters identified`);
      for (const c of clusters) {
        console.log(`   ${c.theme} (${c.discoveries.length} signals)`);
      }

      // 3. Creative synthesis — the core innovation step
      const proposal = await this.synthesizeProposal(clusters, discoveries);
      if (!proposal) {
        console.log('[SYNTHESIS] No novel concept identified this cycle');
        this.lastRunAt = new Date();
        return null;
      }

      console.log(`[PROPOSAL] "${proposal.name}"`);
      console.log(`   Problem: ${proposal.problemStatement}`);
      console.log(`   Users: ${proposal.targetUsers}`);
      console.log(`   Novelty: ${proposal.noveltyScore}/10`);
      console.log(`   Capabilities: ${proposal.capabilities.join(', ')}`);

      // 4. Novelty check — skip if too similar to recent proposals
      const isDuplicate = await this.checkDuplicate(proposal);
      if (isDuplicate) {
        console.log('[NOVELTY] Too similar to recent proposal — skipping');
        this.lastRunAt = new Date();
        return null;
      }

      // 5. Store proposal
      const proposalId = await this.storeProposal(proposal);
      proposal.id = proposalId;
      console.log(`[STORED] Proposal #${proposalId}`);

      await this.notifyProposal(proposal).catch(() => {});

      const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
      console.log(`[COMPLETE] Innovation cycle finished in ${elapsed}s`);
      console.log('='.repeat(70));

      this.lastRunAt = new Date();
      return proposal;

    } catch (err: any) {
      console.error(`[ERROR] Innovation cycle failed: ${err.message}`);
      this.lastRunAt = new Date();
      return null;
    }
  }

  // ─── Intelligence Gathering ───────────────────────────────────

  private async getRecentDiscoveries(hours: number): Promise<any[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, source, title, description, url, stars, forks, upvotes, comments,
              intelligence_level, threat_score, opportunity_score, description
       FROM discoveries
       WHERE discovered_at > NOW() - $1::interval
         AND intelligence_level IN ('HIGH', 'MEDIUM', 'CRITICAL')
       ORDER BY opportunity_score DESC NULLS LAST, threat_score DESC NULLS LAST
       LIMIT 100`,
      [`${Math.ceil(hours)} hours`]
    );
    return result.rows;
  }

  // ─── Clustering ───────────────────────────────────────────────

  private async clusterDiscoveries(discoveries: any[]): Promise<DiscoveryCluster[]> {
    const summaries = discoveries.map(d => 
      `[${d.source}] ${d.title}: ${(d.description || d.summary || '').substring(0, 150)}`
    ).join('\n');

    const response = await this.llm.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      messages: [{
        role: 'system',
        content: `You are an intelligence analyst. Given a list of tech discoveries, group them into 3-6 thematic clusters.
          
Return ONLY valid JSON — no markdown, no backticks:
[
  {
    "theme": "short theme name",
    "discoveryIndices": [0, 3, 7],
    "trendSignal": "what this cluster tells us about where technology is heading"
  }
]`
      }, {
        role: 'user',
        content: summaries
      }],
    });

    const raw = response.choices[0].message.content || '[]';
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      console.error('[CLUSTER] Failed to parse LLM response:', raw.substring(0, 200));
      return [];
    }

    return parsed.map((cluster: any) => ({
      theme: cluster.theme,
      trendSignal: cluster.trendSignal,
      discoveries: (cluster.discoveryIndices || [])
        .filter((i: number) => i < discoveries.length)
        .map((i: number) => ({
          title: discoveries[i].title,
          description: discoveries[i].description || discoveries[i].summary || '',
          source: discoveries[i].source,
          stars: discoveries[i].stars,
          upvotes: discoveries[i].upvotes,
          url: discoveries[i].url,
        })),
    }));
  }

  // ─── Creative Synthesis ───────────────────────────────────────

  private async synthesizeProposal(
    clusters: DiscoveryCluster[],
    allDiscoveries: any[]
  ): Promise<ProjectProposal | null> {
    const clusterSummary = clusters.map(c => 
      `CLUSTER: ${c.theme}\n  Signal: ${c.trendSignal}\n  Sources: ${c.discoveries.map(d => d.title).join(', ')}`
    ).join('\n\n');

    // Get recent proposals to avoid repetition
    const recentProposals = await this.getRecentProposals(10);
    const avoidList = recentProposals.length > 0
      ? `\n\nAVOID these concepts (already proposed recently):\n${recentProposals.map(p => `- ${p.name}: ${p.concept}`).join('\n')}`
      : '';

    const response = await this.llm.chat.completions.create({
      model: this.creativeModel,
      temperature: 0.9, // High creativity
      messages: [{
        role: 'system',
        content: `You are a visionary product strategist and inventor. You analyze technology trends and identify GAPS — products and tools that DON'T EXIST YET but SHOULD.

You DO NOT copy or clone existing projects. You identify:
- Unserved needs adjacent to trending technologies
- Missing infrastructure that multiple projects need
- Novel combinations of unrelated trends
- Problems developers complain about but no one has solved
- The "picks and shovels" for a gold rush

Your proposals must be:
1. GENUINELY NOVEL — not a copy of anything in the trend data
2. TECHNICALLY FEASIBLE — buildable as a REST API or fullstack app
3. IMMEDIATELY USEFUL — solves a real problem for real users
4. SPECIFIC — concrete capabilities, not vague ideas${avoidList}

Return ONLY valid JSON — no markdown, no backticks:
{
  "name": "short-kebab-case-product-name",
  "concept": "one-sentence elevator pitch",
  "problemStatement": "what specific problem this solves that nothing else does",
  "inspirationSources": ["which trends/discoveries inspired this — for attribution, not copying"],
  "targetUsers": "who specifically would use this",
  "capabilities": ["capability 1", "capability 2", "capability 3", "capability 4"],
  "noveltyScore": 8,
  "reasoning": "why this doesn't exist yet and why it should — 2-3 sentences"
}

If you cannot identify a genuinely novel concept from the data, return: {"skip": true, "reason": "explanation"}`
      }, {
        role: 'user',
        content: `TREND INTELLIGENCE:\n\n${clusterSummary}\n\nRAW SIGNAL COUNT: ${allDiscoveries.length} discoveries across ${new Set(allDiscoveries.map(d => d.source)).size} sources\n\nBased on these trends, propose ONE novel application that doesn't exist yet.`
      }],
    });

    const raw = response.choices[0].message.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      console.error('[SYNTHESIS] Failed to parse LLM response:', raw.substring(0, 200));
      return null;
    }

    if (parsed.skip) {
      console.log(`[SYNTHESIS] Skipped: ${parsed.reason}`);
      return null;
    }

    return {
      name: parsed.name,
      concept: parsed.concept,
      problemStatement: parsed.problemStatement,
      inspirationSources: parsed.inspirationSources || [],
      targetUsers: parsed.targetUsers,
      capabilities: parsed.capabilities || [],
      noveltyScore: parsed.noveltyScore || 5,
      reasoning: parsed.reasoning,
      status: 'proposed',
    };
  }

  // ─── Embeddings ───────────────────────────────────────────────

  /**
   * Generate an embedding vector for a proposal's identity string.
   * Falls back to null if the OpenAI embeddings API isn't available (e.g. bitnet mode).
   */
  private async embedText(text: string): Promise<number[] | null> {
    try {
      const response = await this.llm.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch {
      return null;
    }
  }

  // ─── Novelty Check ────────────────────────────────────────────

  /**
   * Cosine similarity duplicate check via pgvector.
   * Falls back to a lightweight LLM check when no embedding is available
   * (e.g. local bitnet inference with no OpenAI key).
   *
   * Threshold: cosine distance < 0.15 (≈ >0.85 similarity) → duplicate.
   */
  private async checkDuplicate(proposal: ProjectProposal): Promise<boolean> {
    const pool = getPool();
    const identity = `${proposal.name}: ${proposal.concept}`;
    const embedding = await this.embedText(identity);

    if (embedding) {
      // Fast vector search — O(log n), no token cost
      const result = await pool.query(
        `SELECT id, name, concept,
                1 - (concept_embedding <=> $1::vector) AS similarity
         FROM innovation_proposals
         WHERE concept_embedding IS NOT NULL
         ORDER BY concept_embedding <=> $1::vector
         LIMIT 1`,
        [`[${embedding.join(',')}]`]
      );
      if (result.rows.length > 0 && result.rows[0].similarity > 0.85) {
        console.log(`[NOVELTY] Vector similarity ${result.rows[0].similarity.toFixed(3)} with "${result.rows[0].name}"`);
        return true;
      }
      return false;
    }

    // Fallback: small LLM check against last 10 proposals only (no context blowout)
    const result = await pool.query(
      `SELECT name, concept FROM innovation_proposals ORDER BY created_at DESC LIMIT 10`
    );
    if (result.rows.length === 0) return false;

    const existing = result.rows.map((r: any) => `${r.name}: ${r.concept}`).join('\n');
    const response = await this.llm.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [{
        role: 'system',
        content: 'You check if a new product proposal is too similar to existing ones. Return ONLY "duplicate" or "novel".'
      }, {
        role: 'user',
        content: `NEW PROPOSAL: ${identity}\n\nEXISTING:\n${existing}\n\nIs the new proposal substantially different from all existing ones?`
      }],
    });
    return (response.choices[0].message.content || '').toLowerCase().includes('duplicate');
  }

  // ─── Database ─────────────────────────────────────────────────

  private async storeProposal(proposal: ProjectProposal): Promise<number> {
    const pool = getPool();
    const embedding = await this.embedText(`${proposal.name}: ${proposal.concept}`);

    const result = await pool.query(
      `INSERT INTO innovation_proposals
         (name, concept, problem_statement, inspiration_sources, target_users,
          capabilities, novelty_score, reasoning, status, concept_embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        proposal.name,
        proposal.concept,
        proposal.problemStatement,
        JSON.stringify(proposal.inspirationSources),
        proposal.targetUsers,
        JSON.stringify(proposal.capabilities),
        proposal.noveltyScore,
        proposal.reasoning,
        proposal.status,
        embedding ? `[${embedding.join(',')}]` : null,
      ]
    );
    return result.rows[0].id;
  }

  private async getRecentProposals(limit: number): Promise<any[]> {
    const pool = getPool();
    try {
      const result = await pool.query(
        `SELECT name, concept FROM innovation_proposals ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch {
      return []; // Table may not exist yet
    }
  }

  // ─── Notifications ────────────────────────────────────────────

  private async notifyProposal(proposal: ProjectProposal): Promise<void> {
    await this.slack.sendCustomAlert({
      type: 'high',
      title: 'INNOVATION AGENT — New Project Proposed',
      message: [
        `*${proposal.name}*`,
        proposal.concept,
        ``,
        `Problem: ${proposal.problemStatement}`,
        `Users: ${proposal.targetUsers}`,
        `Novelty: ${proposal.noveltyScore}/10`,
        `Capabilities: ${proposal.capabilities.join(', ')}`,
        ``,
        `Inspired by: ${proposal.inspirationSources.join(', ')}`,
        `Status: ${proposal.status}`,
      ].join('\n'),
    }).catch(() => {});
  }
}
