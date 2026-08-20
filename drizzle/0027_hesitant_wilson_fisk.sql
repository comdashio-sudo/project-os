CREATE TABLE `master_plan_visualization_rules` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`metric` enum('progress','status','cost') NOT NULL,
	`rulesJson` text NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `master_plan_visualization_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `master_plan_visualization_rules_project_metric_unique` UNIQUE(`tenantId`,`projectId`,`metric`)
);
--> statement-breakpoint
ALTER TABLE `master_plan_visualization_rules` ADD CONSTRAINT `mpvr_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_visualization_rules` ADD CONSTRAINT `mpvr_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_plan_visualization_rules` ADD CONSTRAINT `mpvr_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `master_plan_visualization_rules_tenant_project_idx` ON `master_plan_visualization_rules` (`tenantId`,`projectId`,`updatedAt`);
