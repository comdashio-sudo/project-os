CREATE TABLE `rfis` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`rfiNumber` varchar(120) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`question` text NOT NULL,
	`status` enum('draft','submitted','under_review','answered','closed','cancelled') NOT NULL DEFAULT 'draft',
	`dueAt` timestamp,
	`submittedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rfis_id` PRIMARY KEY(`id`),
	CONSTRAINT `rfis_project_number_unique` UNIQUE(`projectId`,`rfiNumber`)
);
--> statement-breakpoint
ALTER TABLE `rfis` ADD CONSTRAINT `rfis_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rfis` ADD CONSTRAINT `rfis_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rfis` ADD CONSTRAINT `rfis_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `rfis_tenant_project_status_due_idx` ON `rfis` (`tenantId`,`projectId`,`status`,`dueAt`);