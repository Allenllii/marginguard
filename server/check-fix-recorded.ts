import type { CheckFixContext, CheckFixResponse } from '../shared/check-fix.js';

// Recorded live runs of "Check any fix", copied verbatim from the response bodies in
// evidence/check-fix-eval-20261030.json (tests assert byte identity). Replayed offline only.
export interface RecordedCheck { id: string; fix: string; context: CheckFixContext; recordedOn: string; evalRun: string; response: CheckFixResponse; }
export const RECORDED_CHECKS: RecordedCheck[] = [];
