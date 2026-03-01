export interface LogEntry {
  ip: string;
  identity: string;
  user: string;
  timestamp: Date;
  method: string;
  path: string;
  protocol: string;
  status: number;
  size: number;
  referer: string;
  userAgent: string;
  raw: string;
}

export interface ErrorEntry {
  timestamp: string;
  status: number;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
}

export interface DashboardStats {
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  uptimeSeconds: number;
  startedAt: string;
}

export interface ErrorRateBucket {
  minute: string;
  timestamp: number;
  count4xx: number;
  count5xx: number;
}

export interface StatusDistribution {
  [category: string]: number;
}

export interface TopEndpoint {
  path: string;
  method: string;
  count: number;
  lastSeen: string;
}

export interface FullState {
  recentErrors: ErrorEntry[];
  stats: DashboardStats;
  rateHistory: ErrorRateBucket[];
  distribution: StatusDistribution;
  topEndpoints: TopEndpoint[];
}

export type WSMessage =
  | { type: "init"; data: FullState }
  | { type: "error"; data: ErrorEntry }
  | { type: "batch"; data: { stats: DashboardStats; rate: ErrorRateBucket[]; distribution: StatusDistribution; endpoints: TopEndpoint[] } };
