CREATE TABLE `pmc_activity_definitions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`groupId` varchar(36) NOT NULL,
	`stageId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36),
	`modelCode` varchar(80) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`weightPercent` decimal(7,4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pmc_activity_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_activity_defs_model_code_unique` UNIQUE(`projectId`,`modelCode`,`code`)
);
--> statement-breakpoint
CREATE TABLE `pmc_activity_groups` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pmc_activity_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_groups_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `pmc_activity_stages` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`groupId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pmc_activity_stages_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_stages_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `pmc_baselines` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`activityDefinitionId` varchar(36) NOT NULL,
	`periodAt` timestamp NOT NULL,
	`plannedPercent` decimal(7,4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pmc_baselines_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_baseline_activity_period_unique` UNIQUE(`activityDefinitionId`,`periodAt`)
);
--> statement-breakpoint
CREATE TABLE `pmc_blocks` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`zoneId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pmc_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_blocks_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `pmc_inspection_requests` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`requestCode` varchar(80) NOT NULL,
	`activityDefinitionId` varchar(36) NOT NULL,
	`unitIdsJson` text NOT NULL,
	`consultantLabel` varchar(255),
	`responseCode` enum('A','B','C','UR'),
	`requestedAt` timestamp NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pmc_inspection_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_inspections_project_code_unique` UNIQUE(`projectId`,`requestCode`)
);
--> statement-breakpoint
CREATE TABLE `pmc_inspection_steps` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`inspectionRequestId` varchar(36) NOT NULL,
	`stepCode` varchar(80) NOT NULL,
	`status` enum('pending','in_progress','complete','rejected') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pmc_inspection_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_inspection_step_unique` UNIQUE(`inspectionRequestId`,`stepCode`)
);
--> statement-breakpoint
CREATE TABLE `pmc_unit_activity_history` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`unitActivityProgressId` varchar(36) NOT NULL,
	`fromStatus` enum('NOT_STARTED','IN_PROGRESS','UNDER_REVIEW','COMPLETE'),
	`toStatus` enum('NOT_STARTED','IN_PROGRESS','UNDER_REVIEW','COMPLETE') NOT NULL,
	`changedByUserId` int NOT NULL,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	`note` varchar(1000),
	CONSTRAINT `pmc_unit_activity_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pmc_unit_activity_progress` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`unitId` varchar(36) NOT NULL,
	`activityDefinitionId` varchar(36) NOT NULL,
	`status` enum('NOT_STARTED','IN_PROGRESS','UNDER_REVIEW','COMPLETE') NOT NULL DEFAULT 'NOT_STARTED',
	`assignedUserId` int,
	`lastChangedByUserId` int,
	`lastChangedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pmc_unit_activity_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_unit_activity_unique` UNIQUE(`unitId`,`activityDefinitionId`)
);
--> statement-breakpoint
CREATE TABLE `pmc_units` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`blockId` varchar(36) NOT NULL,
	`unitNumber` int NOT NULL,
	`modelCode` varchar(80) NOT NULL,
	`saleStatus` varchar(80),
	`geometryJson` text,
	`unitWeight` decimal(12,4) NOT NULL DEFAULT '1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pmc_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_units_project_number_unique` UNIQUE(`projectId`,`unitNumber`)
);
--> statement-breakpoint
CREATE TABLE `pmc_verification_statuses` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`label` varchar(160) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pmc_verification_statuses_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_verification_status_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `pmc_zones` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pmc_zones_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_zones_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `pmc_activity_definitions` ADD CONSTRAINT `pmc_activity_definitions_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_activity_definitions` ADD CONSTRAINT `pmc_activity_definitions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_activity_definitions` ADD CONSTRAINT `pmc_activity_definitions_groupId_pmc_activity_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `pmc_activity_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_activity_definitions` ADD CONSTRAINT `pmc_activity_definitions_stageId_pmc_activity_stages_id_fk` FOREIGN KEY (`stageId`) REFERENCES `pmc_activity_stages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_activity_definitions` ADD CONSTRAINT `pmc_activity_definitions_wbsItemId_wbs_items_id_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_activity_groups` ADD CONSTRAINT `pmc_activity_groups_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_activity_groups` ADD CONSTRAINT `pmc_activity_groups_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_activity_stages` ADD CONSTRAINT `pmc_activity_stages_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_activity_stages` ADD CONSTRAINT `pmc_activity_stages_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_activity_stages` ADD CONSTRAINT `pmc_activity_stages_groupId_pmc_activity_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `pmc_activity_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_baselines` ADD CONSTRAINT `pmc_baselines_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_baselines` ADD CONSTRAINT `pmc_baselines_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_baselines` ADD CONSTRAINT `pmc_base_activity_fk` FOREIGN KEY (`activityDefinitionId`) REFERENCES `pmc_activity_definitions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_blocks` ADD CONSTRAINT `pmc_blocks_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_blocks` ADD CONSTRAINT `pmc_blocks_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_blocks` ADD CONSTRAINT `pmc_blocks_zoneId_pmc_zones_id_fk` FOREIGN KEY (`zoneId`) REFERENCES `pmc_zones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_inspection_requests` ADD CONSTRAINT `pmc_inspection_requests_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_inspection_requests` ADD CONSTRAINT `pmc_inspection_requests_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_inspection_requests` ADD CONSTRAINT `pmc_insp_activity_fk` FOREIGN KEY (`activityDefinitionId`) REFERENCES `pmc_activity_definitions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_inspection_steps` ADD CONSTRAINT `pmc_inspection_steps_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_inspection_steps` ADD CONSTRAINT `pmc_inspection_steps_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_inspection_steps` ADD CONSTRAINT `pmc_step_request_fk` FOREIGN KEY (`inspectionRequestId`) REFERENCES `pmc_inspection_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_history` ADD CONSTRAINT `pmc_unit_activity_history_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_history` ADD CONSTRAINT `pmc_unit_activity_history_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_history` ADD CONSTRAINT `pmc_unit_activity_history_changedByUserId_users_id_fk` FOREIGN KEY (`changedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_history` ADD CONSTRAINT `pmc_hist_progress_fk` FOREIGN KEY (`unitActivityProgressId`) REFERENCES `pmc_unit_activity_progress`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_progress` ADD CONSTRAINT `pmc_unit_activity_progress_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_progress` ADD CONSTRAINT `pmc_unit_activity_progress_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_progress` ADD CONSTRAINT `pmc_unit_activity_progress_unitId_pmc_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `pmc_units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_progress` ADD CONSTRAINT `pmc_unit_activity_progress_assignedUserId_users_id_fk` FOREIGN KEY (`assignedUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_progress` ADD CONSTRAINT `pmc_unit_activity_progress_lastChangedByUserId_users_id_fk` FOREIGN KEY (`lastChangedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_progress` ADD CONSTRAINT `pmc_progress_activity_fk` FOREIGN KEY (`activityDefinitionId`) REFERENCES `pmc_activity_definitions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_units` ADD CONSTRAINT `pmc_units_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_units` ADD CONSTRAINT `pmc_units_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_units` ADD CONSTRAINT `pmc_units_blockId_pmc_blocks_id_fk` FOREIGN KEY (`blockId`) REFERENCES `pmc_blocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_verification_statuses` ADD CONSTRAINT `pmc_verification_statuses_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_verification_statuses` ADD CONSTRAINT `pmc_verification_statuses_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_zones` ADD CONSTRAINT `pmc_zones_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_zones` ADD CONSTRAINT `pmc_zones_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pmc_activity_defs_tenant_project_model_idx` ON `pmc_activity_definitions` (`tenantId`,`projectId`,`modelCode`);--> statement-breakpoint
CREATE INDEX `pmc_groups_tenant_project_idx` ON `pmc_activity_groups` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `pmc_stages_tenant_project_group_idx` ON `pmc_activity_stages` (`tenantId`,`projectId`,`groupId`);--> statement-breakpoint
CREATE INDEX `pmc_baselines_tenant_project_period_idx` ON `pmc_baselines` (`tenantId`,`projectId`,`periodAt`);--> statement-breakpoint
CREATE INDEX `pmc_blocks_tenant_project_zone_idx` ON `pmc_blocks` (`tenantId`,`projectId`,`zoneId`);--> statement-breakpoint
CREATE INDEX `pmc_inspections_tenant_project_activity_idx` ON `pmc_inspection_requests` (`tenantId`,`projectId`,`activityDefinitionId`);--> statement-breakpoint
CREATE INDEX `pmc_inspection_steps_tenant_project_status_idx` ON `pmc_inspection_steps` (`tenantId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `pmc_history_tenant_project_changed_idx` ON `pmc_unit_activity_history` (`tenantId`,`projectId`,`changedAt`);--> statement-breakpoint
CREATE INDEX `pmc_unit_progress_tenant_project_status_idx` ON `pmc_unit_activity_progress` (`tenantId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `pmc_units_tenant_project_block_idx` ON `pmc_units` (`tenantId`,`projectId`,`blockId`);--> statement-breakpoint
CREATE INDEX `pmc_verification_status_tenant_project_idx` ON `pmc_verification_statuses` (`tenantId`,`projectId`,`active`);--> statement-breakpoint
CREATE INDEX `pmc_zones_tenant_project_idx` ON `pmc_zones` (`tenantId`,`projectId`);