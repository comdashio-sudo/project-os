ALTER TABLE `project_commercial_invoices` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `wbsItemId` varchar(36);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_wbsItemId_wbs_items_id_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `purchase_orders_wbs_idx` ON `purchase_orders` (`wbsItemId`);