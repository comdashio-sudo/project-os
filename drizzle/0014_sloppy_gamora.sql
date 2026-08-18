CREATE TABLE `data_import_errors` (
	`id` varchar(36) NOT NULL,
	`importId` varchar(36) NOT NULL,
	`rowNumber` int NOT NULL,
	`columnName` varchar(128),
	`value` text,
	`code` varchar(96) NOT NULL,
	`severity` enum('error','warning') NOT NULL,
	`suggestedFix` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `data_import_errors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_imports` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36),
	`moduleCode` varchar(64) NOT NULL,
	`templateCode` varchar(64) NOT NULL,
	`sourceFormat` enum('xlsx','csv') NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileHash` varchar(64) NOT NULL,
	`status` enum('uploaded','validated','confirmed','importing','completed','failed','cancelled') NOT NULL DEFAULT 'uploaded',
	`duplicateMode` enum('create_only','update_existing','upsert','skip_duplicates','fail_on_duplicate') NOT NULL DEFAULT 'fail_on_duplicate',
	`totalRows` int NOT NULL DEFAULT 0,
	`validRows` int NOT NULL DEFAULT 0,
	`invalidRows` int NOT NULL DEFAULT 0,
	`createdRows` int NOT NULL DEFAULT 0,
	`updatedRows` int NOT NULL DEFAULT 0,
	`skippedRows` int NOT NULL DEFAULT 0,
	`mappingJson` text,
	`summaryJson` text,
	`createdByUserId` int NOT NULL,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `data_imports_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_imports_tenant_file_hash_unique` UNIQUE(`tenantId`,`fileHash`)
);
--> statement-breakpoint
ALTER TABLE `data_import_errors` ADD CONSTRAINT `data_import_errors_importId_data_imports_id_fk` FOREIGN KEY (`importId`) REFERENCES `data_imports`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `data_imports` ADD CONSTRAINT `data_imports_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `data_imports` ADD CONSTRAINT `data_imports_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `data_imports` ADD CONSTRAINT `data_imports_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `data_import_errors_import_row_idx` ON `data_import_errors` (`importId`,`rowNumber`);--> statement-breakpoint
CREATE INDEX `data_imports_tenant_project_status_idx` ON `data_imports` (`tenantId`,`projectId`,`status`);