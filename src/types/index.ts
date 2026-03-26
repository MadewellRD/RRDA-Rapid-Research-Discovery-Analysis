export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface Discovery {
  id?: number;
  source: string;
  sourceId?: string;
  url: string;
  title: string;
  description?: string;
  stars?: number;
  forks?: number;
  upvotes?: number;
  comments?: number;
  discoveredAt?: Date;
  discovered_at?: Date;
  status?: string;
  metadata?: any;
  
  // Analysis fields (added after AI assessment)
  intelligence_level?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NOISE';
  threat_score?: number;
  opportunity_score?: number;
  summary?: string;
  recommended_action?: string;
}

export interface IntelligenceLevel {
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NOISE';
  threatScore: number;
  opportunityScore: number;
  reasoning: string;
  recommendedAction: string;
}

export interface ScanResult {
  discoveries: Discovery[];
  source: string;
  scannedAt: Date;
}

export interface CompetitiveAnalysisSummary {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  marketImpact: string;
  recommendation: string;
}

export interface InnovationProposal {
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
