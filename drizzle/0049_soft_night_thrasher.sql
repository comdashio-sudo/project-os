CREATE TABLE `boq_items` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36),
	`code` varchar(80) NOT NULL,
	`description` text NOT NULL,
	`unitOfMeasure` varchar(40) NOT NULL,
	`quantity` decimal(18,3) NOT NULL,
	`unitRate` decimal(18,2) NOT NULL,
	`totalAmount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`status` enum('active','cancelled') NOT NULL DEFAULT 'active',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `boq_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `boq_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `project_commercial_invoices` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`invoiceNumber` varchar(80) NOT NULL,
	`invoiceDate` timestamp NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`vatAmount` decimal(18,2) NOT NULL,
	`totalAmount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`status` enum('draft','issued','paid','void') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_commercial_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `proj_inv_project_number_unique` UNIQUE(`projectId`,`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `subcontract_certificate_lines` (
	`id` varchar(36) NOT NULL,
	`certificateId` varchar(36) NOT NULL,
	`boqItemId` varchar(36) NOT NULL,
	`previousQuantity` decimal(18,3) NOT NULL,
	`currentQuantity` decimal(18,3) NOT NULL,
	`cumulativeQuantity` decimal(18,3) NOT NULL,
	`unitRate` decimal(18,2) NOT NULL,
	`currentAmount` decimal(18,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subcontract_certificate_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `subcert_line_unique` UNIQUE(`certificateId`,`boqItemId`)
);
--> statement-breakpoint
CREATE TABLE `subcontract_certificates` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`subcontractId` varchar(36) NOT NULL,
	`certificateNumber` varchar(80) NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`grossAmount` decimal(18,2) NOT NULL,
	`retentionAmount` decimal(18,2) NOT NULL DEFAULT '0',
	`advanceRecoveryAmount` decimal(18,2) NOT NULL DEFAULT '0',
	`netAmount` decimal(18,2) NOT NULL,
	`status` enum('draft','submitted','approved','paid','cancelled') NOT NULL DEFAULT 'draft',
	`approvedByUserId` int,
	`approvedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subcontract_certificates_id` PRIMARY KEY(`id`),
	CONSTRAINT `subcert_project_number_unique` UNIQUE(`projectId`,`certificateNumber`)
);
--> statement-breakpoint
CREATE TABLE `subcontract_contracts` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`title` varchar(255) NOT NULL,
	`subcontractorName` varchar(255) NOT NULL,
	`contractValue` decimal(18,2) NOT NULL,
	`retentionPercent` decimal(5,2) NOT NULL DEFAULT '0',
	`advancePercent` decimal(5,2) NOT NULL DEFAULT '0',
	`status` enum('draft','active','suspended','closed','cancelled') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subcontract_contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `subcontract_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `boq_items` ADD CONSTRAINT `boq_items_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `boq_items` ADD CONSTRAINT `boq_items_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `boq_items` ADD CONSTRAINT `boq_items_wbsItemId_wbs_items_id_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `boq_items` ADD CONSTRAINT `boq_items_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_commercial_invoices` ADD CONSTRAINT `project_commercial_invoices_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_commercial_invoices` ADD CONSTRAINT `project_commercial_invoices_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_commercial_invoices` ADD CONSTRAINT `project_commercial_invoices_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificate_lines` ADD CONSTRAINT `subcontract_certificate_lines_certificateId_subcontract_certificates_id_fk` FOREIGN KEY (`certificateId`) REFERENCES `subcontract_certificates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificate_lines` ADD CONSTRAINT `subcontract_certificate_lines_boqItemId_boq_items_id_fk` FOREIGN KEY (`boqItemId`) REFERENCES `boq_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcontract_certificates_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcontract_certificates_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcontract_certificates_subcontractId_subcontract_contracts_id_fk` FOREIGN KEY (`subcontractId`) REFERENCES `subcontract_contracts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcontract_certificates_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcontract_certificates_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_contracts` ADD CONSTRAINT `subcontract_contracts_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_contracts` ADD CONSTRAINT `subcontract_contracts_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_contracts` ADD CONSTRAINT `subcontract_contracts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `boq_tenant_project_idx` ON `boq_items` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `proj_inv_tenant_project_idx` ON `project_commercial_invoices` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `subcert_tenant_project_idx` ON `subcontract_certificates` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `subcontract_tenant_project_idx` ON `subcontract_contracts` (`tenantId`,`projectId`);