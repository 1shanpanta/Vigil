import type {
  LogEntry,
  ErrorEntry,
  DashboardStats,
  ErrorRateBucket,
  StatusDistribution,
  TopEndpoint,
  FullState,
} from "./types";

const MAX_RECENT_ERRORS = 200;
const MAX_MINUTE_BUCKETS = 60;
const MAX_ENDPOINTS = 500;
const PRUNE_INTERVAL = 60_000;

function minuteKey(date: Date): string {
  return date.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

function formatMinuteLabel(key: string): string {
  return key.slice(11, 16); // "HH:mm"
}

export class ErrorTracker {
  private recentErrors: ErrorEntry[] = [];
  private totalRequests = 0;
  private errorCount = 0;
  private statusCounts = new Map<number, number>();
  private endpointErrors = new Map<string, { count: number; method: string; lastSeen: Date }>();
  private minuteBuckets = new Map<string, { count4xx: number; count5xx: number }>();
  private startedAt = new Date();

  constructor() {
    setInterval(() => this.pruneOldBuckets(), PRUNE_INTERVAL);
  }

  ingest(entry: LogEntry): boolean {
    this.totalRequests++;

    const statusCategory = Math.floor(entry.status / 100);
    this.statusCounts.set(entry.status, (this.statusCounts.get(entry.status) ?? 0) + 1);

    const isError = statusCategory === 4 || statusCategory === 5;

    if (isError) {
      this.errorCount++;

      const error: ErrorEntry = {
        timestamp: entry.timestamp.toISOString(),
        status: entry.status,
        method: entry.method,
        path: entry.path,
        ip: entry.ip,
        userAgent: entry.userAgent,
      };

      this.recentErrors.push(error);
      if (this.recentErrors.length > MAX_RECENT_ERRORS) {
        this.recentErrors.shift();
      }

      // Update minute bucket
      const key = minuteKey(entry.timestamp);
      const bucket = this.minuteBuckets.get(key) ?? { count4xx: 0, count5xx: 0 };
      if (statusCategory === 4) bucket.count4xx++;
      else bucket.count5xx++;
      this.minuteBuckets.set(key, bucket);

      // Update endpoint tracking
      const endpointKey = `${entry.method} ${entry.path}`;
      const ep = this.endpointErrors.get(endpointKey);
      if (ep) {
        ep.count++;
        ep.lastSeen = entry.timestamp;
      } else if (this.endpointErrors.size < MAX_ENDPOINTS) {
        this.endpointErrors.set(endpointKey, {
          count: 1,
          method: entry.method,
          lastSeen: entry.timestamp,
        });
      }
    }

    return isError;
  }

  getRecentErrors(): ErrorEntry[] {
    return this.recentErrors;
  }

  getStats(): DashboardStats {
    const uptimeSeconds = Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
    return {
      totalRequests: this.totalRequests,
      errorCount: this.errorCount,
      errorRate: this.totalRequests > 0
        ? Math.round((this.errorCount / this.totalRequests) * 10000) / 100
        : 0,
      uptimeSeconds,
      startedAt: this.startedAt.toISOString(),
    };
  }

  getRateHistory(): ErrorRateBucket[] {
    const now = new Date();
    const buckets: ErrorRateBucket[] = [];

    // Generate last 60 minutes, filling in zeros for empty minutes
    for (let i = 59; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60_000);
      const key = minuteKey(d);
      const data = this.minuteBuckets.get(key);
      buckets.push({
        minute: formatMinuteLabel(key),
        timestamp: d.getTime(),
        count4xx: data?.count4xx ?? 0,
        count5xx: data?.count5xx ?? 0,
      });
    }

    return buckets;
  }

  getDistribution(): StatusDistribution {
    const dist: StatusDistribution = {
      "2xx": 0,
      "3xx": 0,
      "4xx": 0,
      "5xx": 0,
    };

    for (const [status, count] of this.statusCounts) {
      const category = `${Math.floor(status / 100)}xx`;
      if (category in dist) {
        dist[category] += count;
      }
    }

    return dist;
  }

  getTopEndpoints(): TopEndpoint[] {
    const endpoints: TopEndpoint[] = [];

    for (const [key, data] of this.endpointErrors) {
      const spaceIdx = key.indexOf(" ");
      endpoints.push({
        method: data.method,
        path: key.slice(spaceIdx + 1),
        count: data.count,
        lastSeen: data.lastSeen.toISOString(),
      });
    }

    endpoints.sort((a, b) => b.count - a.count);
    return endpoints.slice(0, 20);
  }

  getFullState(): FullState {
    return {
      recentErrors: this.recentErrors,
      stats: this.getStats(),
      rateHistory: this.getRateHistory(),
      distribution: this.getDistribution(),
      topEndpoints: this.getTopEndpoints(),
    };
  }

  private pruneOldBuckets(): void {
    const cutoff = minuteKey(new Date(Date.now() - MAX_MINUTE_BUCKETS * 60_000));
    for (const key of this.minuteBuckets.keys()) {
      if (key < cutoff) {
        this.minuteBuckets.delete(key);
      }
    }
  }
}
