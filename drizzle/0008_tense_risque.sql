CREATE TABLE `ncrs` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`ncrNumber` varchar(120) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`status` enum('open','under_investigation','corrective_action','verification','closed','cancelled') NOT NULL DEFAULT 'open',
	`dueAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ncrs_id` PRIMARY KEY(`id`),
	CONSTRAINT `ncrs_project_number_unique` UNIQUE(`projectId`,`ncrNumber`)
);
--> statement-breakpoint
ALTER TABLE `ncrs` ADD CONSTRAINT `ncrs_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ncrs` ADD CONSTRAINT `ncrs_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ncrs` ADD CONSTRAINT `ncrs_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ncrs_tenant_project_status_due_idx` ON `ncrs` (`tenantId`,`projectId`,`status`,`dueAt`);