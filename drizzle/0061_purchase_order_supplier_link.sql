ALTER TABLE `purchase_orders` ADD `supplierId` varchar(36);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_supplier_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `purchase_orders_supplier_idx` ON `purchase_orders` (`supplierId`);--> statement-breakpoint
UPDATE `purchase_orders` po SET po.`supplierId` = (SELECT s.`id` FROM `suppliers` s WHERE s.`tenantId` = po.`tenantId` AND s.`legalName` = po.`supplierName`) WHERE po.`supplierId` IS NULL AND (SELECT COUNT(*) FROM `suppliers` s WHERE s.`tenantId` = po.`tenantId` AND s.`legalName` = po.`supplierName`) = 1;
