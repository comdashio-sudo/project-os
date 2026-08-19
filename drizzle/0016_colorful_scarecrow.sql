CREATE TABLE `commercial_features` (
	`id` varchar(36) NOT NULL,
	`code` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`productCode` enum('EXECUTIVE','PMO','PROJECT') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commercial_features_id` PRIMARY KEY(`id`),
	CONSTRAINT `commercial_features_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `commercial_plans` (
	`id` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`packageCode` enum('EXECUTIVE','PMO','PROJECT','EXECUTIVE + PMO','PMO + PROJECT','EXECUTIVE + PROJECT','ALL-IN-ONE') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commercial_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `commercial_plans_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `plan_feature_entitlements` (
	`id` varchar(36) NOT NULL,
	`planId` varchar(36) NOT NULL,
	`featureId` varchar(36) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`limitValue` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plan_feature_entitlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `plan_feature_entitlements_plan_feature_unique` UNIQUE(`planId`,`featureId`)
);
--> statement-breakpoint
CREATE TABLE `tenant_license_feature_overrides` (
	`id` varchar(36) NOT NULL,
	`tenantLicenseId` varchar(36) NOT NULL,
	`featureId` varchar(36) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`limitValue` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_license_feature_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_license_feature_overrides_license_feature_unique` UNIQUE(`tenantLicenseId`,`featureId`)
);
--> statement-breakpoint
CREATE TABLE `tenant_licenses` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`subscriptionId` varchar(36) NOT NULL,
	`planId` varchar(36) NOT NULL,
	`status` enum('trialing','active','past_due','suspended','cancelled','expired','grace_period') NOT NULL DEFAULT 'trialing',
	`seats` int NOT NULL DEFAULT 1,
	`priceAmount` decimal(18,2) NOT NULL DEFAULT '0',
	`discountAmount` decimal(18,2) NOT NULL DEFAULT '0',
	`manualActivation` boolean NOT NULL DEFAULT false,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp,
	`trialEndsAt` timestamp,
	`graceEndsAt` timestamp,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_licenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_licenses_subscription_unique` UNIQUE(`subscriptionId`)
);
--> statement-breakpoint
ALTER TABLE `plan_feature_entitlements` ADD CONSTRAINT `pfe_plan_fk` FOREIGN KEY (`planId`) REFERENCES `commercial_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plan_feature_entitlements` ADD CONSTRAINT `pfe_feature_fk` FOREIGN KEY (`featureId`) REFERENCES `commercial_features`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_license_feature_overrides` ADD CONSTRAINT `tlfo_license_fk` FOREIGN KEY (`tenantLicenseId`) REFERENCES `tenant_licenses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_license_feature_overrides` ADD CONSTRAINT `tlfo_feature_fk` FOREIGN KEY (`featureId`) REFERENCES `commercial_features`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_licenses` ADD CONSTRAINT `tlic_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_licenses` ADD CONSTRAINT `tlic_subscription_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_licenses` ADD CONSTRAINT `tlic_plan_fk` FOREIGN KEY (`planId`) REFERENCES `commercial_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_licenses` ADD CONSTRAINT `tlic_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `commercial_features_product_active_idx` ON `commercial_features` (`productCode`,`active`);--> statement-breakpoint
CREATE INDEX `commercial_plans_package_active_idx` ON `commercial_plans` (`packageCode`,`active`);--> statement-breakpoint
CREATE INDEX `plan_feature_entitlements_feature_idx` ON `plan_feature_entitlements` (`featureId`);--> statement-breakpoint
CREATE INDEX `tenant_license_feature_overrides_feature_idx` ON `tenant_license_feature_overrides` (`featureId`);--> statement-breakpoint
CREATE INDEX `tenant_licenses_tenant_status_idx` ON `tenant_licenses` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `tenant_licenses_plan_idx` ON `tenant_licenses` (`planId`);
