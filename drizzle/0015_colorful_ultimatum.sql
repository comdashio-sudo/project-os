CREATE TABLE `master_plan_spatial_entities` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`masterPlanVersionId` varchar(36) NOT NULL,
	`parentEntityId` varchar(36),
	`code` varchar(120) NOT NULL,
	`name` varchar(255) NOT NULL,
	`entityType` enum('block','building','zone','unit','area') NOT NULL,
	`geometry` text NOT NULL,
	`status` enum('not_started','in_progress','completed','blocked') NOT NULL DEFAULT 'not_started',
	`progressPercent` decimal(5,2) NOT NULL DEFAULT '0',
	`plannedValue` decimal(18,2) NOT NULL DEFAULT '0',
	`actualValue` decimal(18,2) NOT NULL DEFAULT '0',
	`forecastValue` decimal(18,2) NOT NULL DEFAULT '0',
	`wbsItemId` varchar(36),
	`activityId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `master_plan_spatial_entities_id` PRIMARY KEY(`id`),
	CONSTRAINT `master_plan_spatial_entities_version_code_unique` UNIQUE(`masterPlanVersionId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `master_plan_versions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`masterPlanId` varchar(36) NOT NULL,
	`versionNumber` int NOT NULL,
	`versionKind` enum('original','revision','updated') NOT NULL,
	`description` text,
	`changeSummary` text,
	`sourceFileName` varchar(255),
	`storageKey` varchar(512),
	`checksumSha256` varchar(64),
	`uploadedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `master_plan_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `master_plan_versions_plan_version_unique` UNIQUE(`masterPlanId`,`versionNumber`)
);
--> statement-breakpoint
CREATE TABLE `master_plans` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`title` varchar(255) NOT NULL,
	`status` enum('active','superseded','archived') NOT NULL DEFAULT 'active',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `master_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `master_plans_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `master_plan_spatial_entities` ADD CONSTRAINT `mpsent_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_spatial_entities` ADD CONSTRAINT `mpsent_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_spatial_entities` ADD CONSTRAINT `mpsent_version_fk` FOREIGN KEY (`masterPlanVersionId`) REFERENCES `master_plan_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_spatial_entities` ADD CONSTRAINT `mpsent_wbs_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_spatial_entities` ADD CONSTRAINT `mpsent_activity_fk` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_versions` ADD CONSTRAINT `mpvers_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_versions` ADD CONSTRAINT `mpvers_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_versions` ADD CONSTRAINT `mpvers_plan_fk` FOREIGN KEY (`masterPlanId`) REFERENCES `master_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_versions` ADD CONSTRAINT `mpvers_uploader_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plans` ADD CONSTRAINT `mplans_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plans` ADD CONSTRAINT `mplans_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plans` ADD CONSTRAINT `mplans_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `master_plan_spatial_entities_tenant_project_version_idx` ON `master_plan_spatial_entities` (`tenantId`,`projectId`,`masterPlanVersionId`);--> statement-breakpoint
CREATE INDEX `master_plan_spatial_entities_version_status_idx` ON `master_plan_spatial_entities` (`masterPlanVersionId`,`status`);--> statement-breakpoint
CREATE INDEX `master_plan_versions_tenant_project_plan_idx` ON `master_plan_versions` (`tenantId`,`projectId`,`masterPlanId`);--> statement-breakpoint
CREATE INDEX `master_plans_tenant_project_status_idx` ON `master_plans` (`tenantId`,`projectId`,`status`);
