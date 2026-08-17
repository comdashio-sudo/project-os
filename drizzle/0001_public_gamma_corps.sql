CREATE TABLE `audit_logs` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`actorUserId` int,
	`action` varchar(120) NOT NULL,
	`entityType` varchar(120) NOT NULL,
	`entityId` varchar(36),
	`requestId` varchar(80),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` varchar(36) NOT NULL,
	`legalName` varchar(255) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`status` enum('active','suspended','archived') NOT NULL DEFAULT 'active',
	`defaultLocale` enum('ar','en') NOT NULL DEFAULT 'ar',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `membership_roles` (
	`id` varchar(36) NOT NULL,
	`membershipId` varchar(36) NOT NULL,
	`roleId` varchar(36) NOT NULL,
	`scopeType` enum('company','portfolio','program','project') NOT NULL DEFAULT 'company',
	`scopeId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `membership_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `membership_roles_scope_unique` UNIQUE(`membershipId`,`roleId`,`scopeType`,`scopeId`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`status` enum('invited','active','suspended','revoked') NOT NULL DEFAULT 'invited',
	`joinedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `memberships_tenant_user_unique` UNIQUE(`tenantId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` varchar(36) NOT NULL,
	`code` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`productCode` enum('EXECUTIVE','PMO','PROJECT') NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`roleId` varchar(36) NOT NULL,
	`permissionId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_permissions_pk` PRIMARY KEY(`roleId`,`permissionId`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`productCode` enum('EXECUTIVE','PMO','PROJECT'),
	`description` text,
	`systemManaged` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_tenant_code_unique` UNIQUE(`tenantId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`packageCode` enum('EXECUTIVE','PMO','PROJECT','EXECUTIVE + PMO','PMO + PROJECT','EXECUTIVE + PROJECT','ALL-IN-ONE') NOT NULL,
	`status` enum('trialing','active','past_due','cancelled','expired') NOT NULL DEFAULT 'trialing',
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_entitlements` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`subscriptionId` varchar(36) NOT NULL,
	`productCode` enum('EXECUTIVE','PMO','PROJECT') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_entitlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_entitlements_subscription_product_unique` UNIQUE(`subscriptionId`,`productCode`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_roles` ADD CONSTRAINT `membership_roles_membershipId_memberships_id_fk` FOREIGN KEY (`membershipId`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_roles` ADD CONSTRAINT `membership_roles_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_permissions_id_fk` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `roles` ADD CONSTRAINT `roles_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_entitlements` ADD CONSTRAINT `tenant_entitlements_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_entitlements` ADD CONSTRAINT `tenant_entitlements_subscriptionId_subscriptions_id_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_logs_tenant_entity_idx` ON `audit_logs` (`tenantId`,`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `membership_roles_membership_idx` ON `membership_roles` (`membershipId`);--> statement-breakpoint
CREATE INDEX `memberships_user_tenant_idx` ON `memberships` (`userId`,`tenantId`);--> statement-breakpoint
CREATE INDEX `subscriptions_tenant_status_idx` ON `subscriptions` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `tenant_entitlements_tenant_product_idx` ON `tenant_entitlements` (`tenantId`,`productCode`,`active`);