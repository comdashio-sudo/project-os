CREATE TABLE `tenant_settings` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`employerGosiRate` decimal(7,6) NOT NULL DEFAULT '0',
	`indirectLoadingPercent` decimal(7,4) NOT NULL DEFAULT '0',
	`hoursPerDay` decimal(5,2) NOT NULL DEFAULT '8',
	`workingDays` varchar(20) NOT NULL DEFAULT '0,1,2,3,4',
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_settings_tenant_unique` UNIQUE(`tenantId`)
);
--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD `rateSource` enum('loaded','resource');--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD CONSTRAINT `tenant_settings_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD CONSTRAINT `tenant_settings_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT IGNORE INTO `permissions` (`id`, `code`, `name`, `productCode`) VALUES (UUID(), 'project.settings.labour', 'Configure labour cost loading and the working calendar', 'PROJECT');--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`) SELECT r.`id`, p.`id` FROM `roles` r INNER JOIN `permissions` p ON p.`code` = 'project.settings.labour' WHERE r.`code` = 'TENANT_OWNER';
