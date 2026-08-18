CREATE TABLE `internal_notifications` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`recipientUserId` int NOT NULL,
	`projectId` varchar(36),
	`notificationCode` varchar(120) NOT NULL,
	`entityType` varchar(120),
	`entityId` varchar(36),
	`payload` text NOT NULL,
	`acknowledgedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `internal_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `internal_notifications` ADD CONSTRAINT `internal_notifications_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `internal_notifications` ADD CONSTRAINT `internal_notifications_recipientUserId_users_id_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `internal_notifications` ADD CONSTRAINT `internal_notifications_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `internal_notifications_recipient_tenant_ack_idx` ON `internal_notifications` (`recipientUserId`,`tenantId`,`acknowledgedAt`);--> statement-breakpoint
CREATE INDEX `internal_notifications_tenant_project_idx` ON `internal_notifications` (`tenantId`,`projectId`);