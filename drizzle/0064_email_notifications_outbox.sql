CREATE TABLE `email_notification_preferences` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('support_escalation','approvals_waiting','daily_digest') NOT NULL,
	`enabled` boolean NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_preferences_unique` UNIQUE(`tenantId`,`userId`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`recipientUserId` int NOT NULL,
	`kind` enum('support_escalation','approvals_waiting','daily_digest') NOT NULL,
	`dedupeKey` varchar(160) NOT NULL,
	`subject` varchar(300) NOT NULL,
	`bodyText` text NOT NULL,
	`bodyHtml` text NOT NULL,
	`status` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`lastError` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `email_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_outbox_dedupe_unique` UNIQUE(`tenantId`,`recipientUserId`,`kind`,`dedupeKey`)
);
--> statement-breakpoint
ALTER TABLE `email_notification_preferences` ADD CONSTRAINT `enp_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_notification_preferences` ADD CONSTRAINT `enp_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_outbox` ADD CONSTRAINT `eo_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_outbox` ADD CONSTRAINT `eo_user_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `email_outbox_status_created_idx` ON `email_outbox` (`status`,`createdAt`);