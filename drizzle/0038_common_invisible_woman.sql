CREATE TABLE `employee_assignments` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`employeeId` varchar(36) NOT NULL,
	`projectResourceId` varchar(36) NOT NULL,
	`wbsItemId` varchar(36),
	`activityId` varchar(36),
	`plannedStartAt` timestamp NOT NULL,
	`plannedFinishAt` timestamp NOT NULL,
	`plannedHours` decimal(12,2) NOT NULL,
	`status` enum('planned','active','closed','cancelled') NOT NULL DEFAULT 'planned',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employee_attendance` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`employeeId` varchar(36) NOT NULL,
	`attendanceDate` timestamp NOT NULL,
	`attendanceStatus` enum('present','absent','leave','secondment') NOT NULL,
	`status` enum('draft','submitted','approved','rejected') NOT NULL DEFAULT 'draft',
	`note` varchar(1000),
	`createdByUserId` int NOT NULL,
	`reviewedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_attendance_tenant_day_unique` UNIQUE(`tenantId`,`employeeId`,`attendanceDate`)
);
--> statement-breakpoint
CREATE TABLE `employee_time_entries` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`assignmentId` varchar(36) NOT NULL,
	`employeeId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`workDate` timestamp NOT NULL,
	`actualHours` decimal(8,2) NOT NULL,
	`reportedProgressPercent` decimal(5,2),
	`status` enum('draft','submitted','approved','rejected') NOT NULL DEFAULT 'draft',
	`costEntryId` varchar(36),
	`progressEntryId` varchar(36),
	`createdByUserId` int NOT NULL,
	`reviewedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_time_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_time_entries_assignment_day_unique` UNIQUE(`assignmentId`,`workDate`),
	CONSTRAINT `employee_time_entries_cost_entry_unique` UNIQUE(`costEntryId`)
);
--> statement-breakpoint
ALTER TABLE `employee_assignments` ADD CONSTRAINT `ea_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_assignments` ADD CONSTRAINT `ea_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_assignments` ADD CONSTRAINT `ea_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_assignments` ADD CONSTRAINT `ea_resource_fk` FOREIGN KEY (`projectResourceId`) REFERENCES `project_resources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_assignments` ADD CONSTRAINT `ea_wbs_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_assignments` ADD CONSTRAINT `ea_activity_fk` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_assignments` ADD CONSTRAINT `ea_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_attendance` ADD CONSTRAINT `eat_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_attendance` ADD CONSTRAINT `eat_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_attendance` ADD CONSTRAINT `eat_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_attendance` ADD CONSTRAINT `eat_reviewer_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD CONSTRAINT `ete_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD CONSTRAINT `ete_assignment_fk` FOREIGN KEY (`assignmentId`) REFERENCES `employee_assignments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD CONSTRAINT `ete_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD CONSTRAINT `ete_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD CONSTRAINT `ete_cost_fk` FOREIGN KEY (`costEntryId`) REFERENCES `cost_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD CONSTRAINT `ete_progress_fk` FOREIGN KEY (`progressEntryId`) REFERENCES `progress_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD CONSTRAINT `ete_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_time_entries` ADD CONSTRAINT `ete_reviewer_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `employee_assignments_tenant_project_idx` ON `employee_assignments` (`tenantId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `employee_assignments_employee_window_idx` ON `employee_assignments` (`tenantId`,`employeeId`,`plannedStartAt`,`plannedFinishAt`);--> statement-breakpoint
CREATE INDEX `employee_attendance_tenant_status_idx` ON `employee_attendance` (`tenantId`,`status`,`attendanceDate`);--> statement-breakpoint
CREATE INDEX `employee_time_entries_tenant_project_idx` ON `employee_time_entries` (`tenantId`,`projectId`,`status`,`workDate`);
