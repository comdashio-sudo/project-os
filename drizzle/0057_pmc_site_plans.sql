CREATE TABLE `pmc_site_plans` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(64) NOT NULL,
	`widthPx` int NOT NULL,
	`heightPx` int NOT NULL,
	`fileHash` varchar(64) NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pmc_site_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `pmc_site_plans` ADD CONSTRAINT `pmc_site_plans_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_site_plans` ADD CONSTRAINT `pmc_site_plans_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pmc_site_plans` ADD CONSTRAINT `pmc_site_plans_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pmc_site_plans_tenant_project_idx` ON `pmc_site_plans` (`tenantId`,`projectId`,`createdAt`);