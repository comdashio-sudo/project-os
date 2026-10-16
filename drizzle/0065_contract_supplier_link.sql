ALTER TABLE `contracts` ADD `counterpartyKind` enum('client','supplier','other') DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `contracts` ADD `supplierId` varchar(36);--> statement-breakpoint
ALTER TABLE `subcontract_contracts` ADD `supplierId` varchar(36);--> statement-breakpoint
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_supplier_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_contracts` ADD CONSTRAINT `subcon_supplier_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `contracts_supplier_idx` ON `contracts` (`supplierId`);--> statement-breakpoint
CREATE INDEX `subcontract_supplier_idx` ON `subcontract_contracts` (`supplierId`);--> statement-breakpoint
-- Conservative backfill, as for purchase orders (0061): a contract or subcontract is linked only when its free-text counterparty matches exactly one register entry of the same tenant by name. Anything ambiguous or unmatched stays a name (a client has no register).
UPDATE `contracts` c SET c.`supplierId` = (SELECT s.`id` FROM `suppliers` s WHERE s.`tenantId` = c.`tenantId` AND s.`legalName` = c.`counterparty`), c.`counterpartyKind` = 'supplier' WHERE c.`supplierId` IS NULL AND (SELECT COUNT(*) FROM `suppliers` s WHERE s.`tenantId` = c.`tenantId` AND s.`legalName` = c.`counterparty`) = 1;--> statement-breakpoint
UPDATE `subcontract_contracts` sc SET sc.`supplierId` = (SELECT s.`id` FROM `suppliers` s WHERE s.`tenantId` = sc.`tenantId` AND s.`legalName` = sc.`subcontractorName`) WHERE sc.`supplierId` IS NULL AND (SELECT COUNT(*) FROM `suppliers` s WHERE s.`tenantId` = sc.`tenantId` AND s.`legalName` = sc.`subcontractorName`) = 1;
