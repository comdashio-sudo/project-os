CREATE TABLE `pmc_inspection_request_units` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`inspectionRequestId` varchar(36) NOT NULL,
	`unitId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pmc_inspection_request_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_inspection_unit_unique` UNIQUE(`inspectionRequestId`,`unitId`)
);
--> statement-breakpoint
CREATE TABLE `pmc_status_factors` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`status` enum('NOT_STARTED','IN_PROGRESS','UNDER_REVIEW','COMPLETE') NOT NULL,
	`factor` decimal(5,4) NOT NULL,
	`updatedByUserId` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pmc_status_factors_id` PRIMARY KEY(`id`),
	CONSTRAINT `pmc_status_factor_unique` UNIQUE(`projectId`,`status`)
);
--> statement-breakpoint
ALTER TABLE `pmc_inspection_requests` MODIFY COLUMN `unitIdsJson` text;--> statement-breakpoint
ALTER TABLE `pmc_inspection_requests` ADD `contractorLabel` varchar(255);--> statement-breakpoint
ALTER TABLE `pmc_inspection_steps` ADD `stepOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `pmc_inspection_steps` ADD `holderLabel` varchar(255);--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_progress` ADD `verificationStatusId` varchar(36);--> statement-breakpoint
ALTER TABLE `pmc_inspection_request_units` ADD CONSTRAINT `pmc_inspection_request_units_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_inspection_request_units` ADD CONSTRAINT `pmc_inspection_request_units_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_inspection_request_units` ADD CONSTRAINT `pmc_inspection_unit_request_fk` FOREIGN KEY (`inspectionRequestId`) REFERENCES `pmc_inspection_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_inspection_request_units` ADD CONSTRAINT `pmc_inspection_unit_unit_fk` FOREIGN KEY (`unitId`) REFERENCES `pmc_units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_status_factors` ADD CONSTRAINT `pmc_status_factors_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_status_factors` ADD CONSTRAINT `pmc_status_factors_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_status_factors` ADD CONSTRAINT `pmc_status_factors_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pmc_inspection_units_tenant_project_idx` ON `pmc_inspection_request_units` (`tenantId`,`projectId`,`unitId`);--> statement-breakpoint
CREATE INDEX `pmc_status_factors_tenant_project_idx` ON `pmc_status_factors` (`tenantId`,`projectId`);--> statement-breakpoint
ALTER TABLE `pmc_unit_activity_progress` ADD CONSTRAINT `pmc_progress_verification_fk` FOREIGN KEY (`verificationStatusId`) REFERENCES `pmc_verification_statuses`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT IGNORE INTO `permissions` (`id`, `code`, `name`, `productCode`) VALUES (UUID(), 'project.pmc.read', 'View project control (PMC)', 'PROJECT'), (UUID(), 'project.pmc.update', 'Update unit-activity status (PMC)', 'PROJECT'), (UUID(), 'project.pmc.manage', 'Manage the PMC catalogue, baselines and imports', 'PROJECT');
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`) SELECT r.`id`, p.`id` FROM `roles` r INNER JOIN `permissions` p ON p.`code` IN ('project.pmc.read', 'project.pmc.update', 'project.pmc.manage') WHERE r.`code` = 'TENANT_OWNER';

