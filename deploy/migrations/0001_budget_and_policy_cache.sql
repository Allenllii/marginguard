CREATE TABLE live_request_days(service TEXT NOT NULL, period TEXT NOT NULL, used INTEGER NOT NULL CHECK(used >= 0), PRIMARY KEY(service, period));
CREATE TABLE live_request_minutes(service TEXT NOT NULL, period TEXT NOT NULL, used INTEGER NOT NULL CHECK(used >= 0), PRIMARY KEY(service, period));
CREATE TABLE policy_cache(id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX policy_cache_expiry ON policy_cache(expires);
