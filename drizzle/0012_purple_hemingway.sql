CREATE TABLE `project_resources` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`resourceCode` varchar(120) NOT NULL,
	`name` varchar(255) NOT NULL,
	`resourceType` enum('labor','equipment','material','service') NOT NULL,
	`plannedUnits` decimal(14,2) NOT NULL DEFAULT '0',
	`allocatedUnits` decimal(14,2) NOT NULL DEFAULT '0',
	`unitCost` decimal(18,2) NOT NULL DEFAULT '0',
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_resources_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_resources_project_code_unique` UNIQUE(`projectId`,`resourceCode`)
);
--> statement-breakpoint
ALTER TABLE `project_resources` ADD CONSTRAINT `project_resources_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_resources` ADD CONSTRAINT `project_resources_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_resources` ADD CONSTRAINT `project_resources_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_resources_tenant_project_type_idx` ON `project_resources` (`tenantId`,`projectId`,`resourceType`);