CREATE TABLE `warehouse_inventory_transfers` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`sourceWarehouseId` varchar(36) NOT NULL,
	`destinationWarehouseId` varchar(36) NOT NULL,
	`materialId` varchar(36) NOT NULL,
	`quantity` decimal(18,3) NOT NULL,
	`referenceNumber` varchar(120),
	`note` varchar(500),
	`transferredAt` timestamp NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warehouse_inventory_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD `transferId` varchar(36);--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transfers` ADD CONSTRAINT `witf_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transfers` ADD CONSTRAINT `witf_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transfers` ADD CONSTRAINT `witf_source_fk` FOREIGN KEY (`sourceWarehouseId`) REFERENCES `project_warehouses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transfers` ADD CONSTRAINT `witf_destination_fk` FOREIGN KEY (`destinationWarehouseId`) REFERENCES `project_warehouses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transfers` ADD CONSTRAINT `witf_material_fk` FOREIGN KEY (`materialId`) REFERENCES `material_masters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transfers` ADD CONSTRAINT `witf_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `witf_tenant_project_date_idx` ON `warehouse_inventory_transfers` (`tenantId`,`projectId`,`transferredAt`);--> statement-breakpoint
CREATE INDEX `witf_source_destination_idx` ON `warehouse_inventory_transfers` (`sourceWarehouseId`,`destinationWarehouseId`);--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD CONSTRAINT `wit_transfer_fk` FOREIGN KEY (`transferId`) REFERENCES `warehouse_inventory_transfers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `wit_transfer_idx` ON `warehouse_inventory_transactions` (`transferId`);