CREATE TABLE `evm_wbs_snapshots` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`snapshotId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36),
	`bac` decimal(18,2) NOT NULL,
	`ac` decimal(18,2) NOT NULL,
	`eac` decimal(18,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evm_wbs_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `evm_wbs_snapshots_unique` UNIQUE(`snapshotId`,`wbsItemId`)
);
--> statement-breakpoint
ALTER TABLE `change_requests` ADD `contractValueImpact` decimal(18,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `cost_entries` ADD `category` enum('materials','labour','subcontract','other') DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `cost_entries` ADD `sourceType` varchar(40);--> statement-breakpoint
ALTER TABLE `cost_entries` ADD `sourceId` varchar(36);--> statement-breakpoint
ALTER TABLE `evm_snapshots` ADD `adjustedContractValue` decimal(18,2);--> statement-breakpoint
ALTER TABLE `evm_snapshots` ADD `fpac` decimal(18,2);--> statement-breakpoint
ALTER TABLE `evm_wbs_snapshots` ADD CONSTRAINT `evm_wbs_snapshots_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evm_wbs_snapshots` ADD CONSTRAINT `evm_wbs_snapshots_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evm_wbs_snapshots` ADD CONSTRAINT `evm_wbs_snapshots_snapshotId_evm_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `evm_snapshots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evm_wbs_snapshots` ADD CONSTRAINT `evm_wbs_snapshots_wbsItemId_wbs_items_id_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `evm_wbs_snapshots_project_idx` ON `evm_wbs_snapshots` (`tenantId`,`projectId`);