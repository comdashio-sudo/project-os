CREATE TABLE `activities` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36),
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('not_started','in_progress','completed','blocked') NOT NULL DEFAULT 'not_started',
	`plannedValue` decimal(18,2) NOT NULL DEFAULT '0',
	`earnedValue` decimal(18,2) NOT NULL DEFAULT '0',
	`plannedStartAt` timestamp,
	`plannedFinishAt` timestamp,
	`actualStartAt` timestamp,
	`actualFinishAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`),
	CONSTRAINT `activities_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `budget_lines` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36),
	`costCode` varchar(80) NOT NULL,
	`originalAmount` decimal(18,2) NOT NULL DEFAULT '0',
	`currentAmount` decimal(18,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cost_entries` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36),
	`amount` decimal(18,2) NOT NULL,
	`entryType` enum('actual','accrual','adjustment') NOT NULL,
	`status` enum('draft','posted','void') NOT NULL DEFAULT 'draft',
	`incurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cost_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evm_snapshots` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`periodAt` timestamp NOT NULL,
	`pv` decimal(18,2) NOT NULL,
	`ev` decimal(18,2) NOT NULL,
	`ac` decimal(18,2) NOT NULL,
	`bac` decimal(18,2) NOT NULL,
	`cv` decimal(18,2) NOT NULL,
	`sv` decimal(18,2) NOT NULL,
	`cpi` decimal(12,4),
	`spi` decimal(12,4),
	`eac` decimal(18,2) NOT NULL,
	`etc` decimal(18,2) NOT NULL,
	`vac` decimal(18,2) NOT NULL,
	`tcpi` decimal(12,4),
	`eacMethod` enum('bac_over_cpi','ac_plus_remaining','ac_plus_remaining_over_cpi_spi','manual') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evm_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `evm_snapshots_project_period_unique` UNIQUE(`projectId`,`periodAt`)
);
--> statement-breakpoint
CREATE TABLE `portfolios` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('active','on_hold','closed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portfolios_id` PRIMARY KEY(`id`),
	CONSTRAINT `portfolios_tenant_code_unique` UNIQUE(`tenantId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`portfolioId` varchar(36),
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('active','on_hold','closed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `programs_id` PRIMARY KEY(`id`),
	CONSTRAINT `programs_tenant_code_unique` UNIQUE(`tenantId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `progress_entries` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36),
	`activityId` varchar(36),
	`progressPercent` decimal(5,2) NOT NULL,
	`status` enum('draft','submitted','validated','rejected') NOT NULL DEFAULT 'draft',
	`measuredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `progress_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`portfolioId` varchar(36),
	`programId` varchar(36),
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`projectType` varchar(120) NOT NULL,
	`lifecycleStage` enum('opportunity','pre_award','tender','award','mobilization','planning','design','procurement','execution','commissioning','handover','closeout','post_project_review') NOT NULL DEFAULT 'planning',
	`status` enum('draft','active','on_hold','closed','cancelled') NOT NULL DEFAULT 'draft',
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`contractValue` decimal(18,2) NOT NULL DEFAULT '0',
	`originalBudget` decimal(18,2) NOT NULL DEFAULT '0',
	`currentBudget` decimal(18,2) NOT NULL DEFAULT '0',
	`actualCost` decimal(18,2) NOT NULL DEFAULT '0',
	`committedCost` decimal(18,2) NOT NULL DEFAULT '0',
	`forecastCost` decimal(18,2) NOT NULL DEFAULT '0',
	`plannedStartAt` timestamp,
	`plannedFinishAt` timestamp,
	`forecastFinishAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_tenant_code_unique` UNIQUE(`tenantId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `wbs_items` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`parentId` varchar(36),
	`code` varchar(80) NOT NULL,
	`name` varchar(255) NOT NULL,
	`plannedValue` decimal(18,2) NOT NULL DEFAULT '0',
	`earnedValue` decimal(18,2) NOT NULL DEFAULT '0',
	`actualCost` decimal(18,2) NOT NULL DEFAULT '0',
	`progressPercent` decimal(5,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wbs_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `wbs_items_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_wbsItemId_wbs_items_id_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_wbsItemId_wbs_items_id_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cost_entries` ADD CONSTRAINT `cost_entries_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cost_entries` ADD CONSTRAINT `cost_entries_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cost_entries` ADD CONSTRAINT `cost_entries_wbsItemId_wbs_items_id_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evm_snapshots` ADD CONSTRAINT `evm_snapshots_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evm_snapshots` ADD CONSTRAINT `evm_snapshots_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portfolios` ADD CONSTRAINT `portfolios_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `programs` ADD CONSTRAINT `programs_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `programs` ADD CONSTRAINT `programs_portfolioId_portfolios_id_fk` FOREIGN KEY (`portfolioId`) REFERENCES `portfolios`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `progress_entries` ADD CONSTRAINT `progress_entries_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `progress_entries` ADD CONSTRAINT `progress_entries_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `progress_entries` ADD CONSTRAINT `progress_entries_wbsItemId_wbs_items_id_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `progress_entries` ADD CONSTRAINT `progress_entries_activityId_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_portfolioId_portfolios_id_fk` FOREIGN KEY (`portfolioId`) REFERENCES `portfolios`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_programId_programs_id_fk` FOREIGN KEY (`programId`) REFERENCES `programs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wbs_items` ADD CONSTRAINT `wbs_items_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wbs_items` ADD CONSTRAINT `wbs_items_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activities_tenant_project_idx` ON `activities` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `budget_lines_tenant_project_idx` ON `budget_lines` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `cost_entries_tenant_project_date_idx` ON `cost_entries` (`tenantId`,`projectId`,`incurredAt`);--> statement-breakpoint
CREATE INDEX `evm_snapshots_tenant_project_idx` ON `evm_snapshots` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `programs_tenant_portfolio_idx` ON `programs` (`tenantId`,`portfolioId`);--> statement-breakpoint
CREATE INDEX `progress_entries_tenant_project_date_idx` ON `progress_entries` (`tenantId`,`projectId`,`measuredAt`);--> statement-breakpoint
CREATE INDEX `projects_tenant_portfolio_idx` ON `projects` (`tenantId`,`portfolioId`);--> statement-breakpoint
CREATE INDEX `projects_tenant_program_idx` ON `projects` (`tenantId`,`programId`);--> statement-breakpoint
CREATE INDEX `wbs_items_tenant_project_idx` ON `wbs_items` (`tenantId`,`projectId`);