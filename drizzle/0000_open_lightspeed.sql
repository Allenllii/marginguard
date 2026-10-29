CREATE TABLE `live_request_days` (
	`service` text NOT NULL,
	`period` text NOT NULL,
	`used` integer NOT NULL,
	PRIMARY KEY(`service`, `period`),
	CONSTRAINT "live_request_days_used_nonnegative" CHECK("live_request_days"."used" >= 0)
);
--> statement-breakpoint
CREATE TABLE `live_request_minutes` (
	`service` text NOT NULL,
	`period` text NOT NULL,
	`used` integer NOT NULL,
	PRIMARY KEY(`service`, `period`),
	CONSTRAINT "live_request_minutes_used_nonnegative" CHECK("live_request_minutes"."used" >= 0)
);
--> statement-breakpoint
CREATE TABLE `policy_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `policy_cache_expiry` ON `policy_cache` (`expires`);