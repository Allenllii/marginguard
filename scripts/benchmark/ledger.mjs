// Evaluation-only, dependency-free, synchronous write-ahead cost ledger.
// Reservations permanently consume approved caps, including failures and unknowns.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const ZERO_HASH = '0'.repeat(64);
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SECRET_PREFIX = /^(?:sk-|tvly-|Bearer|eyJ)/i;
const RESERVATION_KEYS = ['requestId', 'caseId', 'arm', 'stage', 'provider', 'requestHash', 'reserveMicros'];
const RESULT_KEYS = ['responseHash', 'validatedOutputHash', 'httpStatus', 'usage', 'actualCostMicros', 'providerRequestId'];

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  throw new Error('Value cannot be represented as canonical JSON');
}

export function canonicalHash(value) {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Expected plain metadata object');
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unapproved metadata field');
}

function integer(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('Invalid integer budget or usage');
  return value;
}

function identifier(value) {
  if (typeof value !== 'string' || !ID.test(value) || SECRET_PREFIX.test(value)) throw new Error('Invalid redacted identifier');
  return value;
}

function digest(value) {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error('Invalid SHA-256 digest');
  return value;
}

function limits(options) {
  object(options.providerLimits, ['model', 'search']);
  return {
    maxHttpRequests: integer(options.maxHttpRequests, 1, 120),
    providerLimits: { model: integer(options.providerLimits.model, 0, 96), search: integer(options.providerLimits.search, 0, 24) },
    maxReservedMicros: integer(options.maxReservedMicros, 1),
  };
}

function reservation(meta) {
  object(meta, RESERVATION_KEYS);
  const result = {
    requestId: identifier(meta.requestId), caseId: identifier(meta.caseId),
    arm: meta.arm, stage: identifier(meta.stage), provider: meta.provider,
    requestHash: digest(meta.requestHash), reserveMicros: integer(meta.reserveMicros, 1),
  };
  if (!['A', 'B', 'C'].includes(result.arm) || !['model', 'search'].includes(result.provider)) throw new Error('Invalid arm or provider');
  return result;
}

function resultMetadata(meta = {}) {
  object(meta, RESULT_KEYS);
  let usage = null;
  if (meta.usage != null) {
    object(meta.usage, ['inputTokens', 'outputTokens', 'totalTokens', 'credits']);
    usage = {};
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens']) usage[key] = meta.usage[key] == null ? null : integer(meta.usage[key], 0);
    const credits = meta.usage.credits;
    if (credits != null && (typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0 || credits > Number.MAX_SAFE_INTEGER)) throw new Error('Invalid credit usage');
    usage.credits = credits ?? null;
    if (usage.inputTokens !== null && usage.outputTokens !== null && usage.totalTokens !== null && usage.inputTokens + usage.outputTokens !== usage.totalTokens) throw new Error('Inconsistent token usage');
  }
  return {
    responseHash: meta.responseHash == null ? null : digest(meta.responseHash),
    validatedOutputHash: meta.validatedOutputHash == null ? null : digest(meta.validatedOutputHash),
    httpStatus: meta.httpStatus == null ? null : integer(meta.httpStatus, 100, 599),
    usage,
    actualCostMicros: meta.actualCostMicros == null ? null : integer(meta.actualCostMicros, 0),
    providerRequestId: meta.providerRequestId == null ? null : identifier(meta.providerRequestId),
  };
}

function writeFully(fd, content) {
  const bytes = Buffer.from(content, 'utf8');
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
  fsyncSync(fd);
}

/**
 * One process owns directory until close(). No network transport is provided.
 * Restart with the same approved caps. reclaimLock requires a provably dead PID;
 * it never evicts a live/ambiguous process. Recovery marks pending requests unknown.
 */
export class RequestLedger {
  constructor(options) {
    object(options, ['directory', 'maxHttpRequests', 'providerLimits', 'maxReservedMicros', 'reclaimLock']);
    if (typeof options.directory !== 'string' || !options.directory) throw new Error('Ledger directory required');
    if (options.reclaimLock != null && typeof options.reclaimLock !== 'boolean') throw new Error('Invalid reclaimLock option');
    this.limits = limits(options);
    this.directory = resolve(options.directory);
    this.path = join(this.directory, 'requests.jsonl');
    this.lockPath = join(this.directory, 'requests.lock');
    this.owner = randomUUID();
    this.requests = new Map();
    this.sequence = 0;
    this.lastHash = ZERO_HASH;
    this.closed = false;
    this.fd = null;
    mkdirSync(this.directory, { recursive: true });
    this.acquireLock(options.reclaimLock === true);
    try {
      this.load();
      this.fd = openSync(this.path, 'a', 0o600);
      if (this.sequence === 0) this.append({ type: 'budget', limits: this.limits });
      for (const [id, item] of this.requests) if (item.state === 'reserved') this.unknown(id);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  acquireLock(reclaim) {
    if (existsSync(this.lockPath) && reclaim) {
      let previous;
      try { previous = JSON.parse(readFileSync(this.lockPath, 'utf8')); } catch { throw new Error('Lock is unreadable; inspect it before recovery'); }
      integer(previous.pid, 1);
      try { process.kill(previous.pid, 0); } catch (error) {
        if (error.code !== 'ESRCH') throw new Error('Cannot establish whether ledger owner is alive', { cause: error });
        // Re-read before removing: a replacement lock cannot be reclaimed.
        if (readFileSync(this.lockPath, 'utf8') !== JSON.stringify(previous) + '\n') throw new Error('Ledger lock changed during recovery', { cause: error });
        unlinkSync(this.lockPath);
      }
    }
    let lock;
    try { lock = openSync(this.lockPath, 'wx', 0o600); } catch { throw new Error('Ledger is locked; no request is authorized'); }
    try { writeFully(lock, JSON.stringify({ pid: process.pid, owner: this.owner }) + '\n'); } finally { closeSync(lock); }
  }

  load() {
    if (!existsSync(this.path)) return;
    const content = readFileSync(this.path, 'utf8');
    if (content && !content.endsWith('\n')) throw new Error('Incomplete ledger record; reconciliation required');
    for (const line of content.split('\n').filter(Boolean)) {
      let entry;
      try { entry = JSON.parse(line); } catch { throw new Error('Corrupt ledger JSON; reconciliation required'); }
      const { hash, ...unsigned } = entry;
      if (entry.schemaVersion !== 1 || entry.sequence !== this.sequence + 1 || entry.previousHash !== this.lastHash || hash !== canonicalHash(unsigned)) throw new Error('Broken ledger hash chain; reconciliation required');
      const commonKeys = ['schemaVersion', 'sequence', 'previousHash', 'at', 'type'];
      const eventKeys = entry.type === 'budget' ? ['limits'] : entry.type === 'reserved' ? ['request'] : ['requestId', 'result'];
      object(unsigned, [...commonKeys, ...eventKeys]);
      if (typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at))) throw new Error('Invalid ledger timestamp');
      if (entry.type === 'budget' && this.sequence === 0) {
        object(entry.limits, ['maxHttpRequests', 'providerLimits', 'maxReservedMicros']);
        if (canonicalHash(limits(entry.limits)) !== canonicalHash(this.limits)) throw new Error('Approved ledger caps changed; use original caps');
      } else if (entry.type === 'reserved' && this.sequence > 0) {
        const meta = reservation(entry.request);
        if (this.requests.has(meta.requestId)) throw new Error('Duplicate ledger reservation');
        this.assertBudget(meta);
        this.requests.set(meta.requestId, { ...meta, state: 'reserved', result: null });
      } else if (['completed', 'failed', 'unknown'].includes(entry.type) && this.sequence > 0) {
        const item = this.requests.get(identifier(entry.requestId));
        if (!item || item.state !== 'reserved') throw new Error('Invalid terminal ledger transition');
        const result = resultMetadata(entry.result);
        item.state = entry.type;
        item.result = result;
      } else throw new Error('Invalid ledger event');
      this.sequence = entry.sequence;
      this.lastHash = hash;
    }
  }

  assertOpen() {
    if (this.closed || this.fd === null) throw new Error('Ledger is closed');
  }

  append(event) {
    this.assertOpen();
    const unsigned = { schemaVersion: 1, sequence: this.sequence + 1, previousHash: this.lastHash, at: new Date().toISOString(), ...event };
    const hash = canonicalHash(unsigned);
    try { writeFully(this.fd, JSON.stringify({ ...unsigned, hash }) + '\n'); } catch {
      // A partial or uncertain disk write prevents any further dispatch.
      this.close();
      throw new Error('Ledger durability failed; no further request is authorized');
    }
    this.sequence = unsigned.sequence;
    this.lastHash = hash;
  }

  assertBudget(meta) {
    const current = this.snapshot();
    if (current.reservedHttpRequests >= this.limits.maxHttpRequests || current.providerRequests[meta.provider] >= this.limits.providerLimits[meta.provider] || meta.reserveMicros > this.limits.maxReservedMicros - current.accountedMicros) throw new Error('Approved evaluation request or cost cap exhausted');
  }

  reserve(meta) {
    this.assertOpen();
    const clean = reservation(meta);
    if (this.requests.has(clean.requestId)) throw new Error('Request already reserved; automatic retry is prohibited');
    this.assertBudget(clean);
    this.append({ type: 'reserved', request: clean });
    this.requests.set(clean.requestId, { ...clean, state: 'reserved', result: null });
    return clean.requestId;
  }

  terminal(type, requestId, metadata) {
    this.assertOpen();
    identifier(requestId);
    const item = this.requests.get(requestId);
    if (!item || item.state !== 'reserved') throw new Error('Request is absent or already terminal');
    const result = resultMetadata(metadata);
    this.append({ type, requestId, result });
    item.state = type;
    item.result = result;
  }

  complete(requestId, metadata = {}) { this.terminal('completed', requestId, metadata); }
  fail(requestId, metadata = {}) { this.terminal('failed', requestId, metadata); }
  unknown(requestId, metadata = {}) { this.terminal('unknown', requestId, metadata); }

  lookup(requestId) {
    identifier(requestId);
    const item = this.requests.get(requestId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  snapshot() {
    const providerRequests = { model: 0, search: 0 };
    const outcomes = { reserved: 0, completed: 0, failed: 0, unknown: 0 };
    let reservedMicros = 0, accountedMicros = 0, knownCostMicros = 0, unknownCostRequests = 0;
    for (const item of this.requests.values()) {
      providerRequests[item.provider]++;
      outcomes[item.state]++;
      reservedMicros += item.reserveMicros;
      accountedMicros += Math.max(item.reserveMicros, item.result?.actualCostMicros ?? 0);
      if (item.result?.actualCostMicros == null) unknownCostRequests++;
      else knownCostMicros += item.result.actualCostMicros;
    }
    return { ...this.limits, providerLimits: { ...this.limits.providerLimits }, reservedHttpRequests: this.requests.size, providerRequests, reservedMicros, accountedMicros, outcomes, knownCostMicros, unknownCostRequests, totalCostMicros: unknownCostRequests ? null : knownCostMicros, eventsHash: this.lastHash, lastHash: this.lastHash, reservations: [...this.requests.keys()].map(id => this.lookup(id)) };
  }

  close() {
    if (this.closed) return;
    if (this.fd !== null) { closeSync(this.fd); this.fd = null; }
    this.closed = true;
    // Never remove a different process's lock.
    if (existsSync(this.lockPath)) {
      try { if (JSON.parse(readFileSync(this.lockPath, 'utf8')).owner === this.owner) unlinkSync(this.lockPath); } catch { /* Unreadable lock stays closed. */ }
    }
  }
}
