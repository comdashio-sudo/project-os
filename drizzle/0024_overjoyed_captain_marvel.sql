CREATE TABLE `control_record_links` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`sourceType` enum('risk','issue','action','decision') NOT NULL,
	`sourceId` varchar(36) NOT NULL,
	`targetType` enum('risk','issue','action','decision') NOT NULL,
	`targetId` varchar(36) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `control_record_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `control_record_links_project_source_target_unique` UNIQUE(`projectId`,`sourceType`,`sourceId`,`targetType`,`targetId`)
);
--> statement-breakpoint
ALTER TABLE `control_record_links` ADD CONSTRAINT `control_record_links_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `control_record_links` ADD CONSTRAINT `control_record_links_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `control_record_links` ADD CONSTRAINT `control_record_links_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `control_record_links_tenant_project_source_idx` ON `control_record_links` (`tenantId`,`projectId`,`sourceType`,`sourceId`);--> statement-breakpoint
CREATE INDEX `control_record_links_tenant_project_target_idx` ON `control_record_links` (`tenantId`,`projectId`,`targetType`,`targetId`);