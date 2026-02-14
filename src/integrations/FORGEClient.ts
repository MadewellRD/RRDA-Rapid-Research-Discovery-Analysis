/**
 * FORGE API Client for RDA → FORGE autonomous integration
 * 
 * Handles:
 * - Bearer token authentication
 * - Project creation via POST /api/projects
 * - Idempotency checks (won't re-trigger for same discovery)
 * - Retry logic with exponential backoff (max 3 attempts)
 * - Health checks
 * - Optional WebSocket monitoring
 */
import { Discovery } from '../types/index.js';
import { getPool } from '../database/pool.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface ForgeProjectRequest {
  name: string;
  description: string;
  type: 'api' | 'fullstack' | 'microservices' | 'mobile' | 'legacy-migration';
  features?: string[];
}

export interface ForgeProjectResponse {
  projectId: string;
  status: string;
  message: string;
  websocketUrl?: string;
}

export interface ForgeClientConfig {
  baseUrl: string;
  token: string;
  triggerThreshold: number;
  maxRetries: number;
  retryDelayMs: number;
}

// ─── Client ─────────────────────────────────────────────────────────

export class FORGEClient {
  private config: ForgeClientConfig;

  constructor(config?: Partial<ForgeClientConfig>) {
    this.config = {
      baseUrl: config?.baseUrl || process.env.FORGE_API_URL || 'http://localhost:3001',
      token: config?.token || process.env.FORGE_API_TOKEN || '',
      triggerThreshold: config?.triggerThreshold || parseFloat(process.env.FORGE_TRIGGER_THRESHOLD || '7.5'),
      maxRetries: config?.maxRetries || parseInt(process.env.FORGE_MAX_RETRIES || '3', 10),
      retryDelayMs: config?.retryDelayMs || 5000,
    };

    if (!this.config.token) {
      if (process.env.AUTONOMOUS_RESPONSE_ENABLED === 'true') {
        throw new Error('FORGE_API_TOKEN is required when AUTONOMOUS_RESPONSE_ENABLED=true');
      }
      console.warn('⚠️  FORGE_API_TOKEN not set — FORGE integration will fail on authenticated endpoints');
    }

    console.log(`🔗 FORGE Client initialized → ${this.config.baseUrl}`);
    console.log(`   Trigger threshold: ${this.config.triggerThreshold}`);
    console.log(`   Max retries: ${this.config.maxRetries}`);
  }

  // ─── Core API Methods ─────────────────────────────────────────────

  /**
   * Check if FORGE API is reachable and healthy.
   * Health endpoint does NOT require auth.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return false;
      const data = await res.json() as any;
      return data.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Create a new FORGE project from a discovery.
   * Requires Bearer token auth.
   */
  async createProject(request: ForgeProjectRequest): Promise<ForgeProjectResponse> {
    const res = await fetch(`${this.config.baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.token}`,
        'X-Idempotency-Key': `rda-${request.name}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => 'no body');
      throw new ForgeApiError(res.status, body);
    }

    const json = await res.json() as any;
    if (!json.success) {
      throw new ForgeApiError(0, json.error || 'Unknown FORGE error');
    }

    return json.data as ForgeProjectResponse;
  }

  /**
   * Get status of a FORGE project.
   */
  async getProjectStatus(projectId: string): Promise<any> {
    const res = await fetch(`${this.config.baseUrl}/api/projects/${projectId}`, {
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new ForgeApiError(res.status, `Failed to get project ${projectId}`);
    }

    const json = await res.json() as any;
    return json.data;
  }

  // ─── High-Level Integration Methods ───────────────────────────────

  /**
   * Check if this discovery already has an active FORGE response.
   * Public method for use by AutonomousResponseOrchestrator pre-flight check.
   */
  async hasExistingResponse(discovery: Discovery): Promise<boolean> {
    if (discovery.id) {
      const existing = await this.getExistingResponse(discovery.id);
      if (existing) return true;
    }
    if (discovery.url) {
      const existing = await this.getExistingResponseByUrl(discovery.url);
      if (existing) return true;
    }
    return false;
  }

  /**
   * Should this discovery trigger an autonomous FORGE response?
   */
  shouldTrigger(discovery: Discovery): boolean {
    const score = discovery.threat_score || 0;
    const level = discovery.intelligence_level;
    return level === 'CRITICAL' || (level === 'HIGH' && score >= this.config.triggerThreshold);
  }

  /**
   * Generate a counter-feature for a discovery.
   * Includes idempotency check and retry logic.
   * 
   * Returns null if already triggered or below threshold.
   */
  async triggerCounterFeature(discovery: Discovery): Promise<ForgeProjectResponse | null> {
    // 1. Threshold check
    if (!this.shouldTrigger(discovery)) {
      return null;
    }

    // 2. Idempotency: check if we already have an active response for this discovery
    if (discovery.id) {
      const existing = await this.getExistingResponse(discovery.id);
      if (existing) {
        console.log(`   ⏭️  Already triggered for discovery ${discovery.id} (project: ${existing.forge_project_id}, status: ${existing.status})`);
        return null;
      }
    } else if (discovery.url) {
      // Fallback: check by URL when discovery ID is not available
      const existing = await this.getExistingResponseByUrl(discovery.url);
      if (existing) {
        console.log(`   ⏭️  Already triggered for URL ${discovery.url} (project: ${existing.forge_project_id}, status: ${existing.status})`);
        return null;
      }
    }

    // 3. Health check
    const healthy = await this.healthCheck();
    if (!healthy) {
      console.error('   ❌ FORGE API unreachable — skipping trigger');
      return null;
    }

    // 4. Build request
    const request: ForgeProjectRequest = {
      name: `counter-${this.slugify(discovery.title)}`,
      description: this.buildDescription(discovery),
      type: this.inferProjectType(discovery),
      features: this.extractFeatures(discovery),
    };

    // 5. Execute with retry
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`   ⚡ FORGE trigger attempt ${attempt}/${this.config.maxRetries}...`);
        const response = await this.createProject(request);
        console.log(`   ✅ FORGE project created: ${response.projectId}`);
        return response;

      } catch (error: any) {
        // 409 = FORGE-side duplicate name — treat as success (already handled)
        if (error instanceof ForgeApiError && error.statusCode === 409) {
          console.log(`   ⏭️  FORGE rejected duplicate project name: ${request.name}`);
          return null;
        }

        lastError = error;
        console.error(`   ⚠️  Attempt ${attempt} failed: ${error.message}`);

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          console.log(`   ⏳ Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  // ─── Database Helpers ─────────────────────────────────────────────

  /**
   * Check if a response_action already exists for this discovery
   * with status 'initiated' or 'completed'.
   */
  private async getExistingResponse(discoveryId: number): Promise<any | null> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, forge_project_id, status 
         FROM response_actions 
         WHERE discovery_id = $1 AND status IN ('initiated', 'completed')
         ORDER BY created_at DESC LIMIT 1`,
        [discoveryId]
      );
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('   ⚠️  Failed to check existing response:', error.message);
      return null; // Fail open — allow trigger if DB check fails
    }
  }

  /**
   * Fallback dedup: check by URL via discovery table join.
   * Used when discovery.id is not available (legacy callers).
   */
  private async getExistingResponseByUrl(url: string): Promise<any | null> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT ra.id, ra.forge_project_id, ra.status
         FROM response_actions ra
         JOIN discoveries d ON d.id = ra.discovery_id
         WHERE d.url = $1 AND ra.status IN ('initiated', 'completed')
         ORDER BY ra.created_at DESC LIMIT 1`,
        [url]
      );
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('   ⚠️  Failed to check existing response by URL:', error.message);
      return null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private buildDescription(discovery: Discovery): string {
    const parts = [
      `Build an API service with capabilities equivalent to: ${discovery.title}`,
      discovery.description ? `\nCapabilities to implement: ${discovery.description}` : '',
      discovery.recommended_action ? `\nImplementation approach: ${discovery.recommended_action}` : '',
      `\nPriority: ${discovery.threat_score}/10`,
    ];
    // Cap at 2000 chars for the FORGE API
    return parts.join('').substring(0, 2000);
  }

  private inferProjectType(discovery: Discovery): ForgeProjectRequest['type'] {
    const desc = (discovery.description || '').toLowerCase();
    if (desc.includes('microservice') || desc.includes('distributed')) return 'microservices';
    if (desc.includes('mobile') || desc.includes('react native') || desc.includes('ios') || desc.includes('android')) return 'mobile';
    if (desc.includes('fullstack') || desc.includes('full-stack') || desc.includes('frontend')) return 'fullstack';
    return 'api'; // Default
  }

  private extractFeatures(discovery: Discovery): string[] {
    const features: string[] = ['REST API', 'Authentication', 'API Documentation'];
    const desc = (discovery.description || '').toLowerCase();

    if (desc.includes('real-time') || desc.includes('websocket')) features.push('Real-time updates');
    if (desc.includes('graphql')) features.push('GraphQL API');
    if (desc.includes('ai') || desc.includes('ml') || desc.includes('llm')) features.push('AI/ML integration');
    if (desc.includes('search')) features.push('Full-text search');
    if (desc.includes('queue') || desc.includes('kafka') || desc.includes('rabbitmq')) features.push('Event-driven messaging');

    return features;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Error Class ────────────────────────────────────────────────────

export class ForgeApiError extends Error {
  constructor(public statusCode: number, public body: string) {
    super(`FORGE API error ${statusCode}: ${body.substring(0, 200)}`);
    this.name = 'ForgeApiError';
  }
}
