ALTER TABLE `goods_receipt_notes` ADD `receiptMode` enum('warehouse_stock','direct_to_site') DEFAULT 'direct_to_site' NOT NULL;--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD `warehouseId` varchar(36);--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD `inventoryTransactionId` varchar(36);--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD `unitCost` decimal(18,4);--> statement-breakpoint
ALTER TABLE `warehouse_inventory_transactions` ADD `valueDelta` decimal(18,2);--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `grn_inventory_transaction_unique` UNIQUE(`inventoryTransactionId`);--> statement-breakpoint
-- Receipts recorded before stock valuation booked their cost at the door and never raised a shelf: that is exactly 'direct_to_site'.
-- They are marked explicitly (the column default already says so) and left untouched otherwise: no cost entry is voided, no stock is invented.
-- Existing warehouse movements stay unpriced (unitCost/valueDelta NULL): pricing old issues without the receipts behind them would corrupt the average.
UPDATE `goods_receipt_notes` SET `receiptMode` = 'direct_to_site' WHERE `warehouseId` IS NULL AND `inventoryTransactionId` IS NULL;
