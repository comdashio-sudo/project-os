ALTER TABLE `procurement_requisitions` MODIFY COLUMN `status` enum('draft','submitted','approved','partially_issued','closed','rejected','cancelled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD `wbsItemId` varchar(36);--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD `activityId` varchar(36);--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD `requisitionId` varchar(36);--> statement-breakpoint
ALTER TABLE `procurement_requisitions` MODIFY COLUMN `status` enum('draft','submitted','approved','partially_issued','closed','rejected','cancelled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD CONSTRAINT `prq_wbs_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD CONSTRAINT `prq_activity_fk` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD CONSTRAINT `wit_requisition_fk` FOREIGN KEY (`requisitionId`) REFERENCES `procurement_requisitions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `warehouse_inventory_transactions_requisition_idx` ON `warehouse_inventory_transactions` (`requisitionId`,`transactionType`);
