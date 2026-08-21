CREATE TABLE `procurement_requisitions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`requisitionNumber` varchar(120) NOT NULL,
	`supplierId` varchar(36),
	`materialId` varchar(36),
	`description` text NOT NULL,
	`requestedQuantity` decimal(18,3) NOT NULL,
	`unitOfMeasure` varchar(40) NOT NULL,
	`requiredAt` timestamp NOT NULL,
	`status` enum('draft','submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'draft',
	`reviewedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `procurement_requisitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `procurement_requisitions_project_number_unique` UNIQUE(`projectId`,`requisitionNumber`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`legalName` varchar(240) NOT NULL,
	`contactName` varchar(160),
	`contactEmail` varchar(254),
	`contactPhone` varchar(60),
	`active` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `suppliers_tenant_code_unique` UNIQUE(`tenantId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD CONSTRAINT `prq_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD CONSTRAINT `prq_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD CONSTRAINT `prq_supplier_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD CONSTRAINT `prq_material_fk` FOREIGN KEY (`materialId`) REFERENCES `material_masters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD CONSTRAINT `prq_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suppliers` ADD CONSTRAINT `sup_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suppliers` ADD CONSTRAINT `sup_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `procurement_requisitions_tenant_project_status_idx` ON `procurement_requisitions` (`tenantId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `suppliers_tenant_active_idx` ON `suppliers` (`tenantId`,`active`);