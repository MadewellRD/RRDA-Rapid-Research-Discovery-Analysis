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
