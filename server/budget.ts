export type LiveService = 'tavily' | 'nebius';
export interface BudgetResult { allowed: boolean; retryAfterSeconds: number; reason: string; }
/**
 * `reserve` takes one service or the full set of attempts a pipeline needs. A set is
 * checked before anything is counted, so a pipeline that cannot finish is denied
 * before its first provider request instead of spending a credit and then stopping.
 */
export interface LiveBudget { durable: boolean; reserve(service: LiveService | readonly LiveService[], now: number): Promise<BudgetResult>; }
export interface BudgetLimits { daily: number; total: number; minute: number; }
export const DEFAULT_BUDGET_LIMITS: BudgetLimits = { daily: 20, total: 100, minute: 2 };
export function budgetLimits(env: Record<string, string | undefined>): BudgetLimits {
  const read = (name: string, fallback: number, maximum: number) => { const n = Number(env[name] ?? fallback); if (!Number.isInteger(n) || n < 1 || n > maximum) throw new Error(`Invalid ${name}; use a bounded positive integer.`); return n; };
  return { daily: read('LIVE_DAILY_LIMIT', 20, 100), total: read('LIVE_TOTAL_LIMIT', 100, 1000), minute: read('LIVE_MINUTE_LIMIT', 2, 6) };
}
/** Attempts per service, e.g. ['tavily', 'tavily', 'nebius'] -> tavily 2, nebius 1. */
function tally(service: LiveService | readonly LiveService[]): [LiveService, number][] {
  const counts = new Map<LiveService, number>();
  for (const s of typeof service === 'string' ? [service] : service) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts];
}
const MINUTE_DENIED = 'Live request rate limit reached. Offline analysis remains available.';
const DAY_DENIED = 'Live daily or total budget reached. Offline analysis remains available.';
export class MemoryBudget implements LiveBudget {
  readonly durable = false;
  private counts = new Map<string, number>();
  constructor(private limits = DEFAULT_BUDGET_LIMITS) {}
  async reserve(service: LiveService | readonly LiveService[], now: number): Promise<BudgetResult> {
    const date = new Date(now).toISOString().slice(0, 10), minute = Math.floor(now / 60000);
    // All-or-nothing: no awaits between the check and the increment.
    const needed = tally(service).flatMap(([s, n]) => [
      { key: `${s}:minute:${minute}`, n, max: this.limits.minute, minuteKey: true },
      { key: `${s}:day:${date}`, n, max: this.limits.daily, minuteKey: false },
      { key: `${s}:total`, n, max: this.limits.total, minuteKey: false },
    ]);
    const over = needed.find(({ key, n, max }) => (this.counts.get(key) ?? 0) + n > max);
    if (over) return { allowed: false, retryAfterSeconds: over.minuteKey ? 60 : 86400, reason: over.minuteKey ? MINUTE_DENIED : DAY_DENIED };
    needed.forEach(({ key, n }) => this.counts.set(key, (this.counts.get(key) ?? 0) + n));
    for (const key of this.counts.keys()) if (key.includes(':minute:') && Number(key.split(':').at(-1)) < minute - 1) this.counts.delete(key);
    return { allowed: true, retryAfterSeconds: 0, reason: 'Attempts reserved before upstream request.' };
  }
}
export interface D1Statement { bind(...args: unknown[]): D1Statement; first<T>(): Promise<T | null>; run(): Promise<unknown>; }
export interface D1Like { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<unknown[]>; }
export class D1Budget implements LiveBudget {
  readonly durable = true;
  constructor(private db: D1Like, private limits = DEFAULT_BUDGET_LIMITS) {}
  async reserve(service: LiveService | readonly LiveService[], now: number): Promise<BudgetResult> {
    // https://developers.cloudflare.com/d1/worker-api/prepared-statements/
    const minute = String(Math.floor(now / 60000)), day = new Date(now).toISOString().slice(0, 10), { minute: perMinute, daily, total } = this.limits;
    const wanted = tally(service);
    // Read-only capacity check first, so a set that cannot fit is denied without counting anything.
    for (const [s, n] of wanted) {
      const used = await this.db.prepare('SELECT (SELECT COALESCE(SUM(used), 0) FROM live_request_minutes WHERE service = ? AND period = ?) AS minute, (SELECT COALESCE(SUM(used), 0) FROM live_request_days WHERE service = ? AND period = ?) AS day, (SELECT COALESCE(SUM(used), 0) FROM live_request_days WHERE service = ?) AS total')
        .bind(s, minute, s, day, s).first<{ minute: number; day: number; total: number }>();
      if (!used || used.minute + n > perMinute) return { allowed: false, retryAfterSeconds: 60, reason: MINUTE_DENIED };
      if (used.day + n > daily || used.total + n > total) return { allowed: false, retryAfterSeconds: 86400, reason: DAY_DENIED };
    }
    // Each increment is an atomic conditional upsert. A concurrent writer can still win the
    // race after the check; then the earlier increments stay counted (conservative: the
    // ledger may over-count, never under-count) and the caller dispatches nothing.
    for (const [s, n] of wanted) {
      const minuteRow = await this.db.prepare('INSERT INTO live_request_minutes(service, period, used) SELECT ?, ?, ? WHERE ? <= ? ON CONFLICT(service, period) DO UPDATE SET used = used + ? WHERE used + ? <= ? RETURNING used')
        .bind(s, minute, n, n, perMinute, n, n, perMinute).first<{ used: number }>();
      if (!minuteRow) return { allowed: false, retryAfterSeconds: 60, reason: MINUTE_DENIED };
      const row = await this.db.prepare('INSERT INTO live_request_days(service, period, used) SELECT ?, ?, ? WHERE ? <= ? AND (SELECT COALESCE(SUM(used), 0) FROM live_request_days WHERE service = ?) + ? <= ? ON CONFLICT(service, period) DO UPDATE SET used = used + ? WHERE used + ? <= ? AND (SELECT COALESCE(SUM(used), 0) FROM live_request_days WHERE service = ?) + ? <= ? RETURNING used')
        .bind(s, day, n, n, daily, s, n, total, n, n, daily, s, n, total).first<{ used: number }>();
      if (!row) return { allowed: false, retryAfterSeconds: 86400, reason: DAY_DENIED };
    }
    return { allowed: true, retryAfterSeconds: 0, reason: 'Durable attempts reserved.' };
  }
}
