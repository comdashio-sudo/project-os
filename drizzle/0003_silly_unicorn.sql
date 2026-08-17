CREATE TABLE `actions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36),
	`title` varchar(255) NOT NULL,
	`description` text,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`ownerMembershipId` varchar(36),
	`dueAt` timestamp,
	`evidenceDocumentId` varchar(36),
	`escalationStatus` enum('none','pending','escalated') NOT NULL DEFAULT 'none',
	`status` enum('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36),
	`problem` text NOT NULL,
	`options` text NOT NULL,
	`recommendation` text,
	`costImpact` decimal(18,2),
	`scheduleImpactDays` int,
	`riskImpact` text,
	`decisionOwnerMembershipId` varchar(36),
	`decision` text,
	`status` enum('draft','submitted','approved','rejected','implemented') NOT NULL DEFAULT 'draft',
	`decidedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`title` varchar(255) NOT NULL,
	`cause` text,
	`impact` text,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`ownerMembershipId` varchar(36),
	`dueAt` timestamp,
	`escalationStatus` enum('none','pending','escalated') NOT NULL DEFAULT 'none',
	`status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `issues_id` PRIMARY KEY(`id`),
	CONSTRAINT `issues_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `project_health_snapshots` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`periodAt` timestamp NOT NULL,
	`overallScore` decimal(5,2) NOT NULL,
	`status` enum('green','amber','red') NOT NULL,
	`confidence` enum('low','medium','high') NOT NULL,
	`drivers` text NOT NULL,
	`exceptions` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_health_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_health_period_unique` UNIQUE(`projectId`,`periodAt`)
);
--> statement-breakpoint
CREATE TABLE `risks` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`title` varchar(255) NOT NULL,
	`cause` text,
	`event` text,
	`impact` text,
	`probability` int NOT NULL,
	`severity` int NOT NULL,
	`residualProbability` int,
	`residualSeverity` int,
	`response` text,
	`mitigation` text,
	`trigger` text,
	`ownerMembershipId` varchar(36),
	`dueAt` timestamp,
	`status` enum('open','mitigating','accepted','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `risks_id` PRIMARY KEY(`id`),
	CONSTRAINT `risks_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_ownerMembershipId_memberships_id_fk` FOREIGN KEY (`ownerMembershipId`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `decisions` ADD CONSTRAINT `decisions_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `decisions` ADD CONSTRAINT `decisions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `decisions` ADD CONSTRAINT `decisions_decisionOwnerMembershipId_memberships_id_fk` FOREIGN KEY (`decisionOwnerMembershipId`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `issues` ADD CONSTRAINT `issues_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `issues` ADD CONSTRAINT `issues_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `issues` ADD CONSTRAINT `issues_ownerMembershipId_memberships_id_fk` FOREIGN KEY (`ownerMembershipId`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_health_snapshots` ADD CONSTRAINT `project_health_snapshots_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_health_snapshots` ADD CONSTRAINT `project_health_snapshots_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `risks` ADD CONSTRAINT `risks_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `risks` ADD CONSTRAINT `risks_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `risks` ADD CONSTRAINT `risks_ownerMembershipId_memberships_id_fk` FOREIGN KEY (`ownerMembershipId`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `actions_tenant_project_due_idx` ON `actions` (`tenantId`,`projectId`,`dueAt`);--> statement-breakpoint
CREATE INDEX `decisions_tenant_project_status_idx` ON `decisions` (`tenantId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `issues_tenant_project_status_idx` ON `issues` (`tenantId`,`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `project_health_tenant_project_idx` ON `project_health_snapshots` (`tenantId`,`projectId`);--> statement-breakpoint
CREATE INDEX `risks_tenant_project_status_idx` ON `risks` (`tenantId`,`projectId`,`status`);