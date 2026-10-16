CREATE TABLE `tender_bid_adjustments` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`packageId` varchar(36) NOT NULL,
	`bidId` varchar(36) NOT NULL,
	`kind` enum('scope_gap','exclusion','correction','discount') NOT NULL,
	`description` varchar(500) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tender_bid_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tender_bids` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`packageId` varchar(36) NOT NULL,
	`supplierId` varchar(36) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`durationDays` int,
	`validityDays` int,
	`notes` text,
	`status` enum('submitted','withdrawn','disqualified') NOT NULL DEFAULT 'submitted',
	`statusReason` varchar(500),
	`enteredByUserId` int NOT NULL,
	`enteredAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tender_bids_id` PRIMARY KEY(`id`),
	CONSTRAINT `tender_bids_package_supplier_unique` UNIQUE(`packageId`,`supplierId`)
);
--> statement-breakpoint
CREATE TABLE `tender_invitees` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`packageId` varchar(36) NOT NULL,
	`supplierId` varchar(36) NOT NULL,
	`status` enum('invited','declined','submitted') NOT NULL DEFAULT 'invited',
	`invitedAt` timestamp NOT NULL DEFAULT (now()),
	`invitedByUserId` int NOT NULL,
	CONSTRAINT `tender_invitees_id` PRIMARY KEY(`id`),
	CONSTRAINT `tender_invitees_package_supplier_unique` UNIQUE(`packageId`,`supplierId`)
);
--> statement-breakpoint
CREATE TABLE `tender_packages` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`packageCode` varchar(120) NOT NULL,
	`title` varchar(255) NOT NULL,
	`scopeSummary` text,
	`estimateAmount` decimal(18,2),
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`status` enum('draft','open','closed','awarded','cancelled') NOT NULL DEFAULT 'draft',
	`closingAt` timestamp,
	`awardedBidId` varchar(36),
	`awardedContractId` varchar(36),
	`awardedCommitmentId` varchar(36),
	`awardedAt` timestamp,
	`awardedByUserId` int,
	`awardJustification` text,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tender_packages_id` PRIMARY KEY(`id`),
	CONSTRAINT `tender_packages_project_code_unique` UNIQUE(`projectId`,`packageCode`)
);
--> statement-breakpoint
ALTER TABLE `tender_bid_adjustments` ADD CONSTRAINT `tender_bid_adjustments_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_bid_adjustments` ADD CONSTRAINT `tender_bid_adjustments_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_bid_adjustments` ADD CONSTRAINT `tender_bid_adjustments_packageId_tender_packages_id_fk` FOREIGN KEY (`packageId`) REFERENCES `tender_packages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_bid_adjustments` ADD CONSTRAINT `tender_bid_adjustments_bidId_tender_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `tender_bids`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_bid_adjustments` ADD CONSTRAINT `tender_bid_adjustments_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_bids` ADD CONSTRAINT `tender_bids_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_bids` ADD CONSTRAINT `tender_bids_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_bids` ADD CONSTRAINT `tender_bids_packageId_tender_packages_id_fk` FOREIGN KEY (`packageId`) REFERENCES `tender_packages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_bids` ADD CONSTRAINT `tender_bids_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_bids` ADD CONSTRAINT `tender_bids_enteredByUserId_users_id_fk` FOREIGN KEY (`enteredByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_invitees` ADD CONSTRAINT `tender_invitees_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_invitees` ADD CONSTRAINT `tender_invitees_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_invitees` ADD CONSTRAINT `tender_invitees_packageId_tender_packages_id_fk` FOREIGN KEY (`packageId`) REFERENCES `tender_packages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_invitees` ADD CONSTRAINT `tender_invitees_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_invitees` ADD CONSTRAINT `tender_invitees_invitedByUserId_users_id_fk` FOREIGN KEY (`invitedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_packages` ADD CONSTRAINT `tender_packages_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_packages` ADD CONSTRAINT `tender_packages_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_packages` ADD CONSTRAINT `tender_packages_awardedByUserId_users_id_fk` FOREIGN KEY (`awardedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tender_packages` ADD CONSTRAINT `tender_packages_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tender_adjustments_bid_idx` ON `tender_bid_adjustments` (`bidId`);--> statement-breakpoint
CREATE INDEX `tender_adjustments_package_idx` ON `tender_bid_adjustments` (`packageId`);--> statement-breakpoint
CREATE INDEX `tender_bids_package_status_idx` ON `tender_bids` (`packageId`,`status`);--> statement-breakpoint
CREATE INDEX `tender_bids_tenant_project_idx` ON `tender_bids` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `tender_invitees_tenant_project_idx` ON `tender_invitees` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `tender_packages_tenant_project_status_idx` ON `tender_packages` (`tenantId`,`projectId`,`status`,`createdAt`);
--> statement-breakpoint
-- The company owner holds every power by definition; companies created before this migration have an owner role without the four tender powers
-- (the catalog is read when a company is created), so they are granted here once. New companies get them from the catalog.
INSERT INTO `permissions` (`id`, `code`, `name`, `productCode`)
SELECT UUID(), v.code, v.name, 'PROJECT' FROM (
  SELECT 'project.tender.manage' AS code, 'Manage tender packages and invitations' AS name
  UNION ALL SELECT 'project.tender.bids', 'Enter and correct bids' UNION ALL SELECT 'project.tender.level', 'Level and compare bids' UNION ALL SELECT 'project.tender.award', 'Award a tender'
) v WHERE NOT EXISTS (SELECT 1 FROM `permissions` p WHERE p.`code` = v.code);
--> statement-breakpoint
INSERT INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id` FROM `roles` r INNER JOIN `permissions` p ON p.`code` IN ('project.tender.manage', 'project.tender.bids', 'project.tender.level', 'project.tender.award')
WHERE r.`code` = 'TENANT_OWNER' AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp WHERE rp.`roleId` = r.`id` AND rp.`permissionId` = p.`id`);
