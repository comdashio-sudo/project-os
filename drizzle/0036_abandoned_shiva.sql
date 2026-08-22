CREATE TABLE `employees` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`employeeNumber` varchar(80) NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`jobTitle` varchar(160) NOT NULL,
	`department` varchar(160) NOT NULL,
	`hireDate` timestamp NOT NULL,
	`employmentStatus` enum('active','suspended','terminated') NOT NULL DEFAULT 'active',
	`nationality` varchar(120),
	`identityDocumentType` varchar(80),
	`identityReference` varchar(512),
	`linkedUserId` int,
	`retentionPolicy` enum('standard','extended','legal_hold') NOT NULL DEFAULT 'standard',
	`archivedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_tenant_number_unique` UNIQUE(`tenantId`,`employeeNumber`),
	CONSTRAINT `employees_tenant_user_unique` UNIQUE(`tenantId`,`linkedUserId`)
);
--> statement-breakpoint
CREATE TABLE `employment_contracts` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`employeeId` varchar(36) NOT NULL,
	`contractType` enum('permanent','fixed_term','temporary','consulting') NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp,
	`probationEndDate` timestamp,
	`renewalOfContractId` varchar(36),
	`status` enum('active','ended','terminated') NOT NULL DEFAULT 'active',
	`terminationReason` varchar(1000),
	`retentionPolicy` enum('standard','extended','legal_hold') NOT NULL DEFAULT 'standard',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employment_contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_linkedUserId_users_id_fk` FOREIGN KEY (`linkedUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employment_contracts` ADD CONSTRAINT `employment_contracts_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employment_contracts` ADD CONSTRAINT `employment_contracts_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employment_contracts` ADD CONSTRAINT `employment_contracts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `employees_tenant_status_idx` ON `employees` (`tenantId`,`employmentStatus`);--> statement-breakpoint
CREATE INDEX `employment_contracts_tenant_employee_idx` ON `employment_contracts` (`tenantId`,`employeeId`,`status`);