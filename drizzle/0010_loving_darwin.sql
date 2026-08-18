CREATE TABLE `change_requests` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`changeNumber` varchar(120) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`impactScheduleDays` int NOT NULL DEFAULT 0,
	`impactCost` decimal(18,2) NOT NULL DEFAULT '0',
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('draft','submitted','under_review','approved','rejected','cancelled') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`submittedAt` timestamp,
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `change_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `change_requests_project_number_unique` UNIQUE(`projectId`,`changeNumber`)
);
--> statement-breakpoint
ALTER TABLE `change_requests` ADD CONSTRAINT `change_requests_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_requests` ADD CONSTRAINT `change_requests_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_requests` ADD CONSTRAINT `change_requests_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_requests` ADD CONSTRAINT `change_requests_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `change_requests_tenant_project_status_idx` ON `change_requests` (`tenantId`,`projectId`,`status`);