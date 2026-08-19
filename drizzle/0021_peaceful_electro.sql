CREATE TABLE `quality_inspections` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`inspectionNumber` varchar(120) NOT NULL,
	`inspectionType` enum('hold_point','witness','surveillance','testing') NOT NULL,
	`inspectedAt` timestamp NOT NULL,
	`outcome` enum('pass','fail','conditional') NOT NULL,
	`summary` text NOT NULL,
	`status` enum('draft','submitted','accepted','rejected') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quality_inspections_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_inspections_project_number_unique` UNIQUE(`projectId`,`inspectionNumber`)
);
--> statement-breakpoint
ALTER TABLE `quality_inspections` ADD CONSTRAINT `quality_inspections_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quality_inspections` ADD CONSTRAINT `quality_inspections_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quality_inspections` ADD CONSTRAINT `quality_inspections_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `quality_inspections_tenant_project_date_status_idx` ON `quality_inspections` (`tenantId`,`projectId`,`inspectedAt`,`status`);