CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`company_name` text NOT NULL,
	`verdict` text NOT NULL,
	`overall_score` integer NOT NULL,
	`confidence` integer NOT NULL,
	`full_analysis` text NOT NULL,
	`research_timestamp` text NOT NULL,
	`created_at` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`research_hash` text NOT NULL,
	`cache_key` text NOT NULL,
	`cache_expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_analyses_cache` ON `analyses` (`cache_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_analyses_created` ON `analyses` (`created_at`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`lease_expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_jobs_active_ticker` ON `jobs` (`ticker`) WHERE "jobs"."status" = 'running';