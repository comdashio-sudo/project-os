ALTER TABLE `goods_receipt_notes` ADD `unitCost` decimal(18,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD `costEntryId` varchar(36);--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `grn_cost_entry_unique` UNIQUE(`costEntryId`);--> statement-breakpoint
ALTER TABLE `goods_receipt_notes` ADD CONSTRAINT `goods_receipt_notes_costEntryId_cost_entries_id_fk` FOREIGN KEY (`costEntryId`) REFERENCES `cost_entries`(`id`) ON DELETE no action ON UPDATE no action;