CREATE TABLE `project_warehouses` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`locationDescription` varchar(255),
	`active` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_warehouses_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_warehouses_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `warehouse_inventory_transactions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`warehouseId` varchar(36) NOT NULL,
	`materialId` varchar(36) NOT NULL,
	`transactionType` enum('receipt','issue','adjustment') NOT NULL,
	`quantityDelta` decimal(18,3) NOT NULL,
	`referenceNumber` varchar(120),
	`note` varchar(500),
	`occurredAt` timestamp NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warehouse_inventory_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warehouse_stock_balances` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`warehouseId` varchar(36) NOT NULL,
	`materialId` varchar(36) NOT NULL,
	`quantityOnHand` decimal(18,3) NOT NULL DEFAULT '0.000',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warehouse_stock_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `warehouse_stock_balances_warehouse_material_unique` UNIQUE(`warehouseId`,`materialId`)
);
--> statement-breakpoint
ALTER TABLE `project_warehouses` ADD CONSTRAINT `pwh_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_warehouses` ADD CONSTRAINT `pwh_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_warehouses` ADD CONSTRAINT `pwh_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD CONSTRAINT `wit_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD CONSTRAINT `wit_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD CONSTRAINT `wit_warehouse_fk` FOREIGN KEY (`warehouseId`) REFERENCES `project_warehouses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD CONSTRAINT `wit_material_fk` FOREIGN KEY (`materialId`) REFERENCES `material_masters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD CONSTRAINT `wit_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_stock_balances` ADD CONSTRAINT `wsb_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_stock_balances` ADD CONSTRAINT `wsb_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_stock_balances` ADD CONSTRAINT `wsb_warehouse_fk` FOREIGN KEY (`warehouseId`) REFERENCES `project_warehouses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_stock_balances` ADD CONSTRAINT `wsb_material_fk` FOREIGN KEY (`materialId`) REFERENCES `material_masters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_warehouses_tenant_project_active_idx` ON `project_warehouses` (`tenantId`,`projectId`,`active`);--> statement-breakpoint
CREATE INDEX `warehouse_inventory_transactions_tenant_project_date_idx` ON `warehouse_inventory_transactions` (`tenantId`,`projectId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `warehouse_inventory_transactions_warehouse_material_idx` ON `warehouse_inventory_transactions` (`warehouseId`,`materialId`);--> statement-breakpoint
CREATE INDEX `warehouse_stock_balances_tenant_project_idx` ON `warehouse_stock_balances` (`tenantId`,`projectId`,`materialId`);