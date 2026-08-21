CREATE TABLE `invoice_counters` (
	`id` varchar(40) NOT NULL,
	`nextNumber` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoice_counters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`subscriptionId` varchar(36) NOT NULL,
	`sequenceNumber` int NOT NULL,
	`invoiceNumber` varchar(64) NOT NULL,
	`status` enum('issued','void') NOT NULL DEFAULT 'issued',
	`issuedAt` timestamp NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`sellerName` varchar(255) NOT NULL,
	`sellerTaxNumber` varchar(80) NOT NULL,
	`buyerName` varchar(255) NOT NULL,
	`buyerTaxNumber` varchar(80) NOT NULL,
	`subtotalAmount` decimal(18,2) NOT NULL,
	`vatAmount` decimal(18,2) NOT NULL,
	`totalAmount` decimal(18,2) NOT NULL,
	`renderer` enum('structured_json') NOT NULL DEFAULT 'structured_json',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `inv_sequence_unique` UNIQUE(`sequenceNumber`),
	CONSTRAINT `inv_number_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `payment_records` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`subscriptionId` varchar(36) NOT NULL,
	`invoiceId` varchar(36),
	`provider` enum('manual','mock') NOT NULL,
	`operation` enum('create','renew','cancel','refund') NOT NULL,
	`status` enum('pending','confirmed','cancelled','refunded','failed') NOT NULL,
	`providerReference` varchar(120) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`metadata` text,
	`confirmedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `pay_provider_ref_unique` UNIQUE(`provider`,`providerReference`)
);
--> statement-breakpoint
CREATE TABLE `self_service_signup_attempts` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`emailHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `self_service_signup_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_subscriptionId_subscriptions_id_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_subscriptionId_subscriptions_id_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `self_service_signup_attempts` ADD CONSTRAINT `self_service_signup_attempts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `inv_tenant_issued_idx` ON `invoices` (`tenantId`,`issuedAt`);--> statement-breakpoint
CREATE INDEX `pay_tenant_sub_idx` ON `payment_records` (`tenantId`,`subscriptionId`);--> statement-breakpoint
CREATE INDEX `ssa_user_created_idx` ON `self_service_signup_attempts` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ssa_email_created_idx` ON `self_service_signup_attempts` (`emailHash`,`createdAt`);