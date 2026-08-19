ALTER TABLE `purchase_orders` MODIFY COLUMN `status` enum('draft','submitted','approved','issued','received','cancelled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `contractId` varchar(36);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `commitmentId` varchar(36);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `receivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_contractId_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `contracts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_commitmentId_commitments_id_fk` FOREIGN KEY (`commitmentId`) REFERENCES `commitments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `purchase_orders_contract_idx` ON `purchase_orders` (`contractId`);--> statement-breakpoint
CREATE INDEX `purchase_orders_commitment_idx` ON `purchase_orders` (`commitmentId`);