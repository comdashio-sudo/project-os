CREATE TABLE `data_import_row_results` (
	`id` varchar(36) NOT NULL,
	`importId` varchar(36) NOT NULL,
	`rowNumber` int NOT NULL,
	`rowKey` varchar(160) NOT NULL,
	`action` enum('created','updated','skipped') NOT NULL,
	`entityId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `data_import_row_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_import_row_results_import_row_action_unique` UNIQUE(`importId`,`rowNumber`,`action`)
);
--> statement-breakpoint
ALTER TABLE `data_import_row_results` ADD CONSTRAINT `data_import_row_results_importId_data_imports_id_fk` FOREIGN KEY (`importId`) REFERENCES `data_imports`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `data_import_row_results_import_row_idx` ON `data_import_row_results` (`importId`,`rowNumber`);