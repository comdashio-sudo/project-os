CREATE TABLE `hse_observations` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`observationNumber` varchar(120) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`category` enum('safety','health','environment') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','assigned','remediation','verification','closed','cancelled') NOT NULL DEFAULT 'open',
	`dueAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hse_observations_id` PRIMARY KEY(`id`),
	CONSTRAINT `hse_observations_project_number_unique` UNIQUE(`projectId`,`observationNumber`)
);
--> statement-breakpoint
ALTER TABLE `hse_observations` ADD CONSTRAINT `hse_observations_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hse_observations` ADD CONSTRAINT `hse_observations_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hse_observations` ADD CONSTRAINT `hse_observations_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `hse_observations_tenant_project_status_due_idx` ON `hse_observations` (`tenantId`,`projectId`,`status`,`dueAt`);