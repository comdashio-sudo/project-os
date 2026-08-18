CREATE TABLE `commitments` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`contractId` varchar(36),
	`code` varchar(80) NOT NULL,
	`description` varchar(255) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('draft','committed','released','cancelled') NOT NULL DEFAULT 'draft',
	`committedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commitments_id` PRIMARY KEY(`id`),
	CONSTRAINT `commitments_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`title` varchar(255) NOT NULL,
	`counterparty` varchar(255) NOT NULL,
	`contractValue` decimal(18,2) NOT NULL DEFAULT '0',
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('draft','active','suspended','closed','cancelled') NOT NULL DEFAULT 'draft',
	`startAt` timestamp,
	`endAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contracts_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_contractId_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `contracts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `commitments_tenant_project_status_idx` ON `commitments` (`tenantId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `commitments_contract_idx` ON `commitments` (`contractId`);--> statement-breakpoint
CREATE INDEX `contracts_tenant_project_status_idx` ON `contracts` (`tenantId`,`projectId`,`status`);