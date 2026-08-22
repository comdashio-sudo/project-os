ALTER TABLE `procurement_requisitions` ADD `purchaseOrderId` varchar(36);--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD `purchaseOrderLinkedAt` timestamp;--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD `purchaseOrderLinkedByUserId` int;--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD CONSTRAINT `prq_purchase_order_fk` FOREIGN KEY (`purchaseOrderId`) REFERENCES `purchase_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_requisitions` ADD CONSTRAINT `prq_po_linker_fk` FOREIGN KEY (`purchaseOrderLinkedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `procurement_requisitions_purchase_order_idx` ON `procurement_requisitions` (`purchaseOrderId`);
