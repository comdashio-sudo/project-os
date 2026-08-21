CREATE TABLE `material_masters` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`code` varchar(120) NOT NULL,
	`description` varchar(255) NOT NULL,
	`unitOfMeasure` varchar(40) NOT NULL,
	`category` varchar(120) NOT NULL,
	`referenceSpecification` varchar(255),
	`active` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `material_masters_id` PRIMARY KEY(`id`),
	CONSTRAINT `material_masters_tenant_code_unique` UNIQUE(`tenantId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `project_material_overrides` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`materialId` varchar(36) NOT NULL,
	`projectDescription` varchar(255),
	`referenceSpecification` varchar(255),
	`active` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_material_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_material_overrides_project_material_unique` UNIQUE(`projectId`,`materialId`)
);
--> statement-breakpoint
ALTER TABLE `material_masters` ADD CONSTRAINT `material_masters_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_masters` ADD CONSTRAINT `material_masters_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_material_overrides` ADD CONSTRAINT `project_material_overrides_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_material_overrides` ADD CONSTRAINT `project_material_overrides_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_material_overrides` ADD CONSTRAINT `project_material_overrides_materialId_material_masters_id_fk` FOREIGN KEY (`materialId`) REFERENCES `material_masters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_material_overrides` ADD CONSTRAINT `project_material_overrides_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `material_masters_tenant_category_active_idx` ON `material_masters` (`tenantId`,`category`,`active`);--> statement-breakpoint
CREATE INDEX `project_material_overrides_tenant_project_idx` ON `project_material_overrides` (`tenantId`,`projectId`,`materialId`);