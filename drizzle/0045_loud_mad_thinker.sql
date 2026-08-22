CREATE TABLE `material_issues` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`inventoryTransactionId` varchar(36) NOT NULL,
	`costEntryId` varchar(36) NOT NULL,
	`materialId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36) NOT NULL,
	`activityId` varchar(36),
	`issuedQuantity` decimal(18,3) NOT NULL,
	`unitCost` decimal(18,2) NOT NULL,
	`totalCost` decimal(18,2) NOT NULL,
	`issuedAt` timestamp NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `material_issues_id` PRIMARY KEY(`id`),
	CONSTRAINT `material_issues_tx_unique` UNIQUE(`inventoryTransactionId`),
	CONSTRAINT `material_issues_cost_unique` UNIQUE(`costEntryId`)
);
--> statement-breakpoint
ALTER TABLE `material_issues` ADD CONSTRAINT `mi_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_issues` ADD CONSTRAINT `mi_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_issues` ADD CONSTRAINT `mi_tx_fk` FOREIGN KEY (`inventoryTransactionId`) REFERENCES `warehouse_inventory_transactions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_issues` ADD CONSTRAINT `mi_cost_fk` FOREIGN KEY (`costEntryId`) REFERENCES `cost_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_issues` ADD CONSTRAINT `mi_material_fk` FOREIGN KEY (`materialId`) REFERENCES `material_masters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_issues` ADD CONSTRAINT `mi_wbs_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_issues` ADD CONSTRAINT `mi_activity_fk` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_issues` ADD CONSTRAINT `mi_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `material_issues_tenant_project_idx` ON `material_issues` (`tenantId`,`projectId`,`issuedAt`);--> statement-breakpoint
CREATE INDEX `material_issues_wbs_activity_idx` ON `material_issues` (`wbsItemId`,`activityId`);