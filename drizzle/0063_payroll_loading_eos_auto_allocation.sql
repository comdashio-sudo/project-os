CREATE TABLE `payroll_allocation_adjustments` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`allocationId` varchar(36) NOT NULL,
	`previousAmount` decimal(18,2) NOT NULL,
	`newAmount` decimal(18,2) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`adjustedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_allocation_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD `supersededByPayrollEntryId` varchar(36);--> statement-breakpoint
ALTER TABLE `payroll_allocations` ADD `source` enum('manual','auto_hours') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `payroll_allocations` ADD `hoursBasis` decimal(12,2);--> statement-breakpoint
ALTER TABLE `payroll_allocations` ADD `sharePercent` decimal(9,4);--> statement-breakpoint
ALTER TABLE `payroll_entries` ADD `employerSocialInsurance` decimal(18,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `payroll_entries` ADD `indirectLoading` decimal(18,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `payroll_entries` ADD `nationalityClass` varchar(12);--> statement-breakpoint
ALTER TABLE `salary_structures` ADD `eosAccrualMode` enum('computed','manual') DEFAULT 'computed' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD `employerGosiRateSaudi` decimal(7,6) DEFAULT '0.117500' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD `employerGosiRateNonSaudi` decimal(7,6) DEFAULT '0.020000' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD `eosFirstPeriodYears` int DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD `eosFirstPeriodMonthsPerYear` decimal(5,2) DEFAULT '0.50' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD `eosLaterMonthsPerYear` decimal(5,2) DEFAULT '1.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `payroll_allocation_adjustments` ADD CONSTRAINT `paa_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_allocation_adjustments` ADD CONSTRAINT `paa_allocation_fk` FOREIGN KEY (`allocationId`) REFERENCES `payroll_allocations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_allocation_adjustments` ADD CONSTRAINT `paa_user_fk` FOREIGN KEY (`adjustedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payroll_allocation_adjustments_allocation_idx` ON `payroll_allocation_adjustments` (`allocationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payroll_allocation_adjustments_tenant_idx` ON `payroll_allocation_adjustments` (`tenantId`,`createdAt`);--> statement-breakpoint
-- A tenant that had already chosen one insurance rate keeps exactly that choice for both nationalities; tenants still on the old zero default get the owner's defaults (11.75% / 2%).
UPDATE `tenant_settings` SET `employerGosiRateSaudi` = `employerGosiRate`, `employerGosiRateNonSaudi` = `employerGosiRate` WHERE `employerGosiRate` > 0;--> statement-breakpoint
-- A salary structure whose end-of-service accrual was typed in stays manual with that same amount; the rest follow the length of service.
UPDATE `salary_structures` SET `eosAccrualMode` = 'manual' WHERE `eosMonthlyAccrual` > 0;
