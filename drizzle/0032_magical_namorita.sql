CREATE TABLE `knowledge_articles` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`sourceDocumentId` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`publishedByUserId` int,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `kba_document_unique` UNIQUE(`sourceDocumentId`)
);
--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`ticketId` varchar(36) NOT NULL,
	`authorUserId` int,
	`senderType` enum('customer','agent','assistant','system') NOT NULL,
	`body` text NOT NULL,
	`citationsJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`createdByUserId` int NOT NULL,
	`ownerUserId` int,
	`subject` varchar(255) NOT NULL,
	`category` enum('technical','billing','account','general') NOT NULL,
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`status` enum('open','waiting_customer','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`escalationStatus` enum('none','requested','escalated') NOT NULL DEFAULT 'none',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `knowledge_articles` ADD CONSTRAINT `knowledge_articles_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_articles` ADD CONSTRAINT `knowledge_articles_sourceDocumentId_project_documents_id_fk` FOREIGN KEY (`sourceDocumentId`) REFERENCES `project_documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_articles` ADD CONSTRAINT `knowledge_articles_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_articles` ADD CONSTRAINT `knowledge_articles_publishedByUserId_users_id_fk` FOREIGN KEY (`publishedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_ticketId_support_tickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `support_tickets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_authorUserId_users_id_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `kba_tenant_status_idx` ON `knowledge_articles` (`tenantId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `spm_ticket_created_idx` ON `support_messages` (`ticketId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `spm_tenant_created_idx` ON `support_messages` (`tenantId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `spt_tenant_status_idx` ON `support_tickets` (`tenantId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `spt_owner_status_idx` ON `support_tickets` (`ownerUserId`,`status`);