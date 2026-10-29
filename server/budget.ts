export type LiveService = 'tavily' | 'nebius';
export interface BudgetResult { allowed: boolean; retryAfterSeconds: number; reason: string; }
export interface LiveBudget { durable: boolean; reserve(service: LiveService, now: number): Promise<BudgetResult>; }
export interface BudgetLimits { daily: number; total: number; minute: number; }
export const DEFAULT_BUDGET_LIMITS: BudgetLimits = { daily: 20, total: 100, minute: 2 };
export function budgetLimits(env: Record<string, string | undefined>): BudgetLimits {
  const read = (name: string, fallback: number, maximum: number) => { const n = Number(env[name] ?? fallback); if (!Number.isInteger(n) || n < 1 || n > maximum) throw new Error(`Invalid ${name}; use a bounded positive integer.`); return n; };
  return { daily: read('LIVE_DAILY_LIMIT', 20, 100), total: read('LIVE_TOTAL_LIMIT', 100, 1000), minute: read('LIVE_MINUTE_LIMIT', 2, 6) };
}
export class MemoryBudget implements LiveBudget {
  readonly durable = false;
  private counts = new Map<string, number>();
  constructor(private limits = DEFAULT_BUDGET_LIMITS) {}
  async reserve(service: LiveService, now: number): Promise<BudgetResult> {
    const date = new Date(now).toISOString().slice(0, 10), minute = Math.floor(now / 60000);
    const keys = [`${service}:total`, `${service}:day:${date}`, `${service}:minute:${minute}`], max = [this.limits.total, this.limits.daily, this.limits.minute];
    const index = keys.findIndex((key, i) => (this.counts.get(key) ?? 0) >= max[i]);
    if (index >= 0) return { allowed: false, retryAfterSeconds: index === 2 ? 60 : 86400, reason: 'Live request budget reached. Offline analysis remains available.' };
    keys.forEach(key => this.counts.set(key, (this.counts.get(key) ?? 0) + 1));
    for (const key of this.counts.keys()) if (key.includes(':minute:') && Number(key.split(':').at(-1)) < minute - 1) this.counts.delete(key);
    return { allowed: true, retryAfterSeconds: 0, reason: 'Attempt reserved before upstream request.' };
  }
}
export interface D1Statement { bind(...args: unknown[]): D1Statement; first<T>(): Promise<T | null>; run(): Promise<unknown>; }
export interface D1Like { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<unknown[]>; }
export class D1Budget implements LiveBudget {
  readonly durable = true;
  constructor(private db: D1Like, private limits = DEFAULT_BUDGET_LIMITS) {}
  async reserve(service: LiveService, now: number): Promise<BudgetResult> {
    // Each reservation is atomic; a partial reservation fails conservatively.
    // https://developers.cloudflare.com/d1/worker-api/prepared-statements/
    const minute = String(Math.floor(now / 60000)), day = new Date(now).toISOString().slice(0, 10);
    const minuteRow = await this.db.prepare('INSERT INTO live_request_minutes(service, period, used) VALUES (?, ?, 1) ON CONFLICT(service, period) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used').bind(service, minute, this.limits.minute).first<{ used: number }>();
    if (!minuteRow) return { allowed: false, retryAfterSeconds: 60, reason: 'Live request rate limit reached.' };
    const row = await this.db.prepare('INSERT INTO live_request_days(service, period, used) SELECT ?, ?, 1 WHERE (SELECT COALESCE(SUM(used), 0) FROM live_request_days WHERE service = ?) < ? ON CONFLICT(service, period) DO UPDATE SET used = used + 1 WHERE used < ? AND (SELECT COALESCE(SUM(used), 0) FROM live_request_days WHERE service = ?) < ? RETURNING used').bind(service, day, service, this.limits.total, this.limits.daily, service, this.limits.total).first<{ used: number }>();
    return row ? { allowed: true, retryAfterSeconds: 0, reason: 'Durable attempt reserved.' } : { allowed: false, retryAfterSeconds: 86400, reason: 'Live daily or total budget reached. Offline analysis remains available.' };
  }
}
