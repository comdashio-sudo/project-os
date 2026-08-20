CREATE TABLE `master_plan_snapshots` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`masterPlanVersionId` varchar(36) NOT NULL,
	`label` varchar(160) NOT NULL,
	`metric` enum('progress','status','cost','risk','quality','hse','production','custom') NOT NULL,
	`filtersJson` text NOT NULL,
	`viewportJson` text NOT NULL,
	`layersJson` text NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `master_plan_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `master_plan_snapshots` ADD CONSTRAINT `master_plan_snapshots_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_snapshots` ADD CONSTRAINT `master_plan_snapshots_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_snapshots` ADD CONSTRAINT `mps_plan_version_fk` FOREIGN KEY (`masterPlanVersionId`) REFERENCES `master_plan_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_snapshots` ADD CONSTRAINT `master_plan_snapshots_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `master_plan_snapshots_tenant_project_version_creator_idx` ON `master_plan_snapshots` (`tenantId`,`projectId`,`masterPlanVersionId`,`createdByUserId`,`createdAt`);
