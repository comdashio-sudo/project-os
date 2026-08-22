CREATE TABLE `employee_performance_exclusions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`employeeId` varchar(36) NOT NULL,
	`sourceType` enum('activity','action','rfi','ncr','quality_inspection','field_report','material_request') NOT NULL,
	`sourceId` varchar(36) NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `employee_performance_exclusions_id` PRIMARY KEY(`id`),
	CONSTRAINT `epe_source_unique` UNIQUE(`tenantId`,`employeeId`,`sourceType`,`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `employee_performance_objections` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`employeeId` varchar(36) NOT NULL,
	`statement` text NOT NULL,
	`status` enum('submitted','under_review','resolved','rejected') NOT NULL DEFAULT 'submitted',
	`resolutionNote` varchar(1000),
	`createdByUserId` int NOT NULL,
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_performance_objections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employee_performance_exclusions` ADD CONSTRAINT `epe_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_performance_exclusions` ADD CONSTRAINT `epe_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_performance_exclusions` ADD CONSTRAINT `epe_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_performance_exclusions` ADD CONSTRAINT `epe_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_performance_objections` ADD CONSTRAINT `epo_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_performance_objections` ADD CONSTRAINT `epo_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_performance_objections` ADD CONSTRAINT `epo_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_performance_objections` ADD CONSTRAINT `epo_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_performance_objections` ADD CONSTRAINT `epo_reviewer_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `epe_tenant_project_employee_idx` ON `employee_performance_exclusions` (`tenantId`,`projectId`,`employeeId`);--> statement-breakpoint
CREATE INDEX `epo_tenant_project_employee_idx` ON `employee_performance_objections` (`tenantId`,`projectId`,`employeeId`,`status`);