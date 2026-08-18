CREATE TABLE `document_versions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`documentId` varchar(36) NOT NULL,
	`versionNumber` int NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`checksumSha256` varchar(64) NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_versions_document_version_unique` UNIQUE(`documentId`,`versionNumber`)
);
--> statement-breakpoint
CREATE TABLE `project_documents` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`documentNumber` varchar(120) NOT NULL,
	`title` varchar(255) NOT NULL,
	`category` enum('drawing','specification','method_statement','report','correspondence','commercial','other') NOT NULL DEFAULT 'other',
	`status` enum('draft','for_review','approved','superseded','archived') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_documents_project_number_unique` UNIQUE(`projectId`,`documentNumber`)
);
--> statement-breakpoint
ALTER TABLE `document_versions` ADD CONSTRAINT `document_versions_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_versions` ADD CONSTRAINT `document_versions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_versions` ADD CONSTRAINT `document_versions_documentId_project_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `project_documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_versions` ADD CONSTRAINT `document_versions_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_documents` ADD CONSTRAINT `project_documents_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_documents` ADD CONSTRAINT `project_documents_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_documents` ADD CONSTRAINT `project_documents_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `document_versions_tenant_project_document_idx` ON `document_versions` (`tenantId`,`projectId`,`documentId`);--> statement-breakpoint
CREATE INDEX `project_documents_tenant_project_status_idx` ON `project_documents` (`tenantId`,`projectId`,`status`);