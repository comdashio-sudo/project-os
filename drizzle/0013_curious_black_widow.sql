CREATE TABLE `claims` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`contractId` varchar(36),
	`claimNumber` varchar(120) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`claimedAmount` decimal(18,2) NOT NULL,
	`approvedAmount` decimal(18,2),
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('draft','submitted','under_review','approved','rejected','withdrawn') NOT NULL DEFAULT 'draft',
	`submittedAt` timestamp,
	`resolvedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `claims_project_number_unique` UNIQUE(`projectId`,`claimNumber`)
);
--> statement-breakpoint
ALTER TABLE `claims` ADD CONSTRAINT `claims_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `claims` ADD CONSTRAINT `claims_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `claims` ADD CONSTRAINT `claims_contractId_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `contracts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `claims` ADD CONSTRAINT `claims_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `claims_tenant_project_status_idx` ON `claims` (`tenantId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `claims_contract_idx` ON `claims` (`contractId`);