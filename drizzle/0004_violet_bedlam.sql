CREATE TABLE `membership_invitations` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`roleId` varchar(36) NOT NULL,
	`scopeType` enum('company','portfolio','program','project') NOT NULL,
	`scopeId` varchar(36),
	`tokenHash` varchar(64) NOT NULL,
	`status` enum('pending','accepted','expired','revoked') NOT NULL DEFAULT 'pending',
	`invitedByUserId` int NOT NULL,
	`acceptedByUserId` int,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `membership_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `membership_invitations_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `membership_invitations` ADD CONSTRAINT `membership_invitations_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_invitations` ADD CONSTRAINT `membership_invitations_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_invitations` ADD CONSTRAINT `membership_invitations_invitedByUserId_users_id_fk` FOREIGN KEY (`invitedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_invitations` ADD CONSTRAINT `membership_invitations_acceptedByUserId_users_id_fk` FOREIGN KEY (`acceptedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `membership_invitations_tenant_email_status_idx` ON `membership_invitations` (`tenantId`,`email`,`status`);--> statement-breakpoint
CREATE INDEX `membership_invitations_email_status_idx` ON `membership_invitations` (`email`,`status`);