import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const liveRequestDays = sqliteTable('live_request_days', {
  service: text('service').notNull(),
  period: text('period').notNull(),
  used: integer('used').notNull(),
}, table => [primaryKey({ columns: [table.service, table.period] }), check('live_request_days_used_nonnegative', sql`${table.used} >= 0`)]);

export const liveRequestMinutes = sqliteTable('live_request_minutes', {
  service: text('service').notNull(),
  period: text('period').notNull(),
  used: integer('used').notNull(),
}, table => [primaryKey({ columns: [table.service, table.period] }), check('live_request_minutes_used_nonnegative', sql`${table.used} >= 0`)]);

export const policyCache = sqliteTable('policy_cache', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  expires: integer('expires').notNull(),
}, table => [index('policy_cache_expiry').on(table.expires)]);
