CREATE TABLE `goods_receipt_notes` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`purchaseOrderId` varchar(36) NOT NULL,
	`materialId` varchar(36) NOT NULL,
	`qualityInspectionId` varchar(36),
	`ncrId` varchar(36),
	`grnNumber` varchar(120) NOT NULL,
	`receivedQuantity` decimal(18,3) NOT NULL,
	`rejectedQuantity` decimal(18,3) NOT NULL,
	`unitOfMeasure` varchar(40) NOT NULL,
	`receivedAt` timestamp NOT NULL,
	`note` text,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `goods_receipt_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `grn_project_number_unique` UNIQUE(`projectId`,`grnNumber`)
);
--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `grn_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `grn_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `grn_purchase_order_fk` FOREIGN KEY (`purchaseOrderId`) REFERENCES `purchase_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `grn_material_fk` FOREIGN KEY (`materialId`) REFERENCES `material_masters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `grn_quality_fk` FOREIGN KEY (`qualityInspectionId`) REFERENCES `quality_inspections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `grn_ncr_fk` FOREIGN KEY (`ncrId`) REFERENCES `ncrs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `grn_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `grn_tenant_project_date_idx` ON `goods_receipt_notes` (`tenantId`,`projectId`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `grn_purchase_order_idx` ON `goods_receipt_notes` (`purchaseOrderId`);--> statement-breakpoint
CREATE INDEX `grn_material_idx` ON `goods_receipt_notes` (`materialId`);