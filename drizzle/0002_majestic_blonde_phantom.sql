CREATE TABLE `briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`company_name` text NOT NULL,
	`kind` text NOT NULL,
	`as_of` text NOT NULL,
	`model` text NOT NULL,
	`content_hash` text NOT NULL,
	`imported_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_briefs_content` ON `briefs` (`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_briefs_asof` ON `briefs` (`as_of`);