CREATE TABLE `field_reports` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`reportNumber` varchar(120) NOT NULL,
	`reportType` enum('daily','inspection','progress') NOT NULL,
	`reportedAt` timestamp NOT NULL,
	`shift` enum('day','night') NOT NULL DEFAULT 'day',
	`workforceCount` int NOT NULL DEFAULT 0,
	`weather` varchar(160),
	`summary` text NOT NULL,
	`status` enum('draft','submitted','reviewed','approved','rejected') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `field_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `field_reports_project_number_unique` UNIQUE(`projectId`,`reportNumber`)
);
--> statement-breakpoint
ALTER TABLE `field_reports` ADD CONSTRAINT `field_reports_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `field_reports` ADD CONSTRAINT `field_reports_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `field_reports` ADD CONSTRAINT `field_reports_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `field_reports_tenant_project_date_status_idx` ON `field_reports` (`tenantId`,`projectId`,`reportedAt`,`status`);