/**
 * Autonomous Response Orchestrator
 * 
 * Coordinates the RDA → FORGE autonomous innovation loop:
 * 1. Receives assessed discoveries from the scheduler
 * 2. Checks if discovery meets trigger threshold
 * 3. Checks idempotency (no duplicate triggers)
 * 4. Triggers FORGE to generate counter-capability
 * 5. Tracks the response action in PostgreSQL
 * 6. Notifies via Slack
 */
import { Discovery } from '../types/index.js';
import { FORGEClient, ForgeProjectResponse } from './FORGEClient.js';
import { SlackNotifier } from '../notifiers/SlackNotifier.js';
import { getPool } from '../database/pool.js';

export class AutonomousResponseOrchestrator {
  private forge: FORGEClient;
  private slack: SlackNotifier;
  private enabled: boolean;

  constructor() {
    this.forge = new FORGEClient();
    this.slack = new SlackNotifier();
    this.enabled = process.env.AUTONOMOUS_RESPONSE_ENABLED === 'true';

    console.log('🤖 Autonomous Response Orchestrator initialized');
    console.log(`   Mode: ${this.enabled ? '🟢 AUTONOMOUS' : '🟡 MANUAL'}`);
  }

  /**
   * Process a discovery that has already been assessed and stored.
   * This is the main entry point called by the scheduler.
   */
  async processDiscovery(discovery: Discovery): Promise<void> {
    // Check threshold
    if (!this.forge.shouldTrigger(discovery)) {
      return;
    }

    const level = discovery.intelligence_level || 'UNKNOWN';
    const score = discovery.threat_score || 0;

    console.log(`\n🚨 ${level} THREAT DETECTED: ${discovery.title}`);
    console.log(`   Threat Score: ${score}/10`);
    console.log(`   Source: ${discovery.source}`);

    // If autonomous mode is disabled, just notify
    if (!this.enabled) {
      console.log(`   ⚠️  Autonomous mode disabled — notifying for manual intervention`);
      await this.notifyManual(discovery);
      return;
    }

    console.log(`   🤖 Initiating autonomous response...`);

    // Log the action as 'initiated'
    let actionId: number | null = null;
    try {
      actionId = await this.logAction(discovery, 'counter_feature', 'initiated');
    } catch (err: any) {
      console.error(`   ⚠️  Failed to log action: ${err.message}`);
      // Continue anyway — the trigger is more important than the log
    }

    try {
      // Notify team that response is starting
      await this.slack.sendCustomAlert({
        type: 'critical',
        title: '🤖 AUTONOMOUS RESPONSE INITIATED',
        message: [
          `${level} threat detected: ${discovery.title}`,
          `Threat Score: ${score}/10`,
          `Source: ${discovery.source}`,
          `Generating counter-feature via FORGE...`,
        ].join('\n'),
      }).catch(() => {}); // Don't fail the trigger if Slack fails

      // Trigger FORGE
      const project = await this.forge.triggerCounterFeature(discovery);

      if (!project) {
        // Skipped (already triggered or below threshold)
        console.log(`   ⏭️  Skipped — already triggered or below threshold`);
        if (actionId) await this.updateAction(actionId, 'skipped', null);
        return;
      }

      // Success!
      console.log(`   ✅ FORGE project created: ${project.projectId}`);

      // Update action record
      if (actionId) {
        await this.updateAction(actionId, 'completed', {
          forge_project_id: project.projectId,
          forge_status: project.status,
          triggered_at: new Date().toISOString(),
        });
      }

      // Success notification
      await this.slack.sendCustomAlert({
        type: 'critical',
        title: '✅ AUTONOMOUS RESPONSE COMPLETE',
        message: [
          `Counter-feature generated for: ${discovery.title}`,
          `FORGE Project: ${project.projectId}`,
          `Status: ${project.status}`,
          `Code generation in progress...`,
        ].join('\n'),
      }).catch(() => {});

    } catch (error: any) {
      console.error(`   ❌ Autonomous response failed: ${error.message}`);

      // Update action as failed
      if (actionId) {
        await this.updateAction(actionId, 'failed', {
          error: error.message,
          failed_at: new Date().toISOString(),
        });
      }

      // Failure notification
      await this.slack.sendCustomAlert({
        type: 'critical',
        title: '❌ AUTONOMOUS RESPONSE FAILED',
        message: [
          `Failed to generate counter-feature for: ${discovery.title}`,
          `Error: ${error.message}`,
          `Manual intervention required.`,
        ].join('\n'),
      }).catch(() => {});

      // Don't re-throw — we don't want a FORGE failure to crash the scanner
    }
  }

  // ─── Database Methods ─────────────────────────────────────────────

  private async logAction(discovery: Discovery, actionType: string, status: string): Promise<number> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO response_actions (discovery_id, action_type, status, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id`,
      [discovery.id, actionType, status]
    );
    return result.rows[0].id;
  }

  private async updateAction(actionId: number, status: string, result: any): Promise<void> {
    try {
      const pool = getPool();
      await pool.query(
        `UPDATE response_actions 
         SET status = $1, result = $2, completed_at = NOW()
         WHERE id = $3`,
        [status, result ? JSON.stringify(result) : null, actionId]
      );
    } catch (err: any) {
      console.error(`   ⚠️  Failed to update action ${actionId}: ${err.message}`);
    }
  }

  // ─── Notifications ────────────────────────────────────────────────

  private async notifyManual(discovery: Discovery): Promise<void> {
    await this.slack.sendCustomAlert({
      type: 'high',
      title: '⚠️ MANUAL INTERVENTION REQUIRED',
      message: [
        `${discovery.intelligence_level} threat detected: ${discovery.title}`,
        `Threat Score: ${discovery.threat_score}/10`,
        `Recommended: ${discovery.recommended_action || 'Build counter-feature'}`,
        ``,
        `Autonomous mode is disabled. Review and respond manually.`,
      ].join('\n'),
    }).catch(() => {});
  }
}
