CREATE TABLE `salary_structures` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`employeeId` varchar(36) NOT NULL,
	`baseSalary` decimal(18,2) NOT NULL,
	`housingAllowance` decimal(18,2) NOT NULL DEFAULT '0',
	`transportAllowance` decimal(18,2) NOT NULL DEFAULT '0',
	`hardshipAllowance` decimal(18,2) NOT NULL DEFAULT '0',
	`gosiRate` decimal(7,6) NOT NULL DEFAULT '0',
	`otherDeductions` decimal(18,2) NOT NULL DEFAULT '0',
	`eosMonthlyAccrual` decimal(18,2) NOT NULL DEFAULT '0',
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`active` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `salary_structures_id` PRIMARY KEY(`id`),
	CONSTRAINT `salary_structures_tenant_employee_unique` UNIQUE(`tenantId`,`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`status` enum('draft','review','approved','paid') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`reviewedByUserId` int,
	`approvedByUserId` int,
	`approvedAt` timestamp,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_runs_tenant_period_unique` UNIQUE(`tenantId`,`periodStart`,`periodEnd`)
);
--> statement-breakpoint
CREATE TABLE `payroll_entries` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`payrollRunId` varchar(36) NOT NULL,
	`employeeId` varchar(36) NOT NULL,
	`salaryStructureId` varchar(36) NOT NULL,
	`baseSalary` decimal(18,2) NOT NULL,
	`housingAllowance` decimal(18,2) NOT NULL,
	`transportAllowance` decimal(18,2) NOT NULL,
	`hardshipAllowance` decimal(18,2) NOT NULL,
	`gosiDeduction` decimal(18,2) NOT NULL,
	`otherDeductions` decimal(18,2) NOT NULL,
	`eosMonthlyAccrual` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_entries_run_employee_unique` UNIQUE(`payrollRunId`,`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `payroll_allocations` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`payrollEntryId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36),
	`activityId` varchar(36),
	`amount` decimal(18,2) NOT NULL,
	`costEntryId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_allocations_cost_entry_unique` UNIQUE(`costEntryId`)
);
--> statement-breakpoint
ALTER TABLE `salary_structures` ADD CONSTRAINT `salary_structures_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_structures` ADD CONSTRAINT `salary_structures_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_structures` ADD CONSTRAINT `salary_structures_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD CONSTRAINT `payroll_runs_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD CONSTRAINT `payroll_runs_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD CONSTRAINT `payroll_runs_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD CONSTRAINT `payroll_runs_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_entries` ADD CONSTRAINT `payroll_entries_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_entries` ADD CONSTRAINT `payroll_entries_payrollRunId_payroll_runs_id_fk` FOREIGN KEY (`payrollRunId`) REFERENCES `payroll_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_entries` ADD CONSTRAINT `payroll_entries_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_entries` ADD CONSTRAINT `payroll_entries_salaryStructureId_salary_structures_id_fk` FOREIGN KEY (`salaryStructureId`) REFERENCES `salary_structures`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_allocations` ADD CONSTRAINT `payroll_allocations_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_allocations` ADD CONSTRAINT `payroll_allocations_payrollEntryId_payroll_entries_id_fk` FOREIGN KEY (`payrollEntryId`) REFERENCES `payroll_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_allocations` ADD CONSTRAINT `payroll_allocations_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_allocations` ADD CONSTRAINT `payroll_allocations_wbsItemId_wbs_items_id_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_allocations` ADD CONSTRAINT `payroll_allocations_activityId_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_allocations` ADD CONSTRAINT `payroll_allocations_costEntryId_cost_entries_id_fk` FOREIGN KEY (`costEntryId`) REFERENCES `cost_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `salary_structures_tenant_active_idx` ON `salary_structures` (`tenantId`,`active`);--> statement-breakpoint
CREATE INDEX `payroll_runs_tenant_status_idx` ON `payroll_runs` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `payroll_entries_tenant_run_idx` ON `payroll_entries` (`tenantId`,`payrollRunId`);--> statement-breakpoint
CREATE INDEX `payroll_allocations_tenant_project_idx` ON `payroll_allocations` (`tenantId`,`projectId`);
