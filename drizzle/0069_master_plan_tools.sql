ALTER TABLE `master_plan_snapshots` ADD `sharedWithProject` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `master_plan_versions` ADD `rotationDegrees` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `master_plan_versions` ADD `mapWidthMeters` decimal(12,2);--> statement-breakpoint
ALTER TABLE `master_plan_versions` ADD `mapHeightMeters` decimal(12,2);