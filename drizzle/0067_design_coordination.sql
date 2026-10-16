CREATE TABLE `design_comments` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`drawingId` varchar(36) NOT NULL,
	`revisionId` varchar(36) NOT NULL,
	`commentNumber` varchar(120) NOT NULL,
	`raisedBy` varchar(255) NOT NULL,
	`severity` enum('minor','major','critical') NOT NULL DEFAULT 'minor',
	`commentText` text NOT NULL,
	`status` enum('open','responded','closed') NOT NULL DEFAULT 'open',
	`responseText` text,
	`respondedAt` timestamp,
	`respondedByUserId` int,
	`closedAt` timestamp,
	`closedByUserId` int,
	`dueAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `design_comments_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_comments_project_number_unique` UNIQUE(`projectId`,`commentNumber`)
);
--> statement-breakpoint
CREATE TABLE `design_drawing_revisions` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`drawingId` varchar(36) NOT NULL,
	`revision` varchar(20) NOT NULL,
	`description` varchar(500),
	`isCurrent` boolean NOT NULL DEFAULT true,
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	`issuedByUserId` int NOT NULL,
	`approvedAt` timestamp,
	`approvedByUserId` int,
	CONSTRAINT `design_drawing_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_revisions_drawing_revision_unique` UNIQUE(`drawingId`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `design_drawings` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`drawingNumber` varchar(120) NOT NULL,
	`title` varchar(255) NOT NULL,
	`discipline` enum('architectural','interior','landscape','structural','civil','mechanical','electrical','plumbing','fire_fighting','other') NOT NULL,
	`status` enum('registered','under_review','approved','cancelled') NOT NULL DEFAULT 'registered',
	`currentRevision` varchar(20) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_drawings_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_drawings_project_number_unique` UNIQUE(`projectId`,`drawingNumber`)
);
--> statement-breakpoint
CREATE TABLE `design_submittals` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`submittalNumber` varchar(120) NOT NULL,
	`title` varchar(255) NOT NULL,
	`discipline` enum('architectural','interior','landscape','structural','civil','mechanical','electrical','plumbing','fire_fighting','other') NOT NULL,
	`drawingId` varchar(36),
	`resubmissionOfId` varchar(36),
	`status` enum('draft','submitted','replied','closed') NOT NULL DEFAULT 'draft',
	`submittedAt` timestamp,
	`submittedByUserId` int,
	`dueAt` timestamp,
	`replyCode` enum('A','B','C','D'),
	`replyNote` text,
	`repliedAt` timestamp,
	`repliedByUserId` int,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `design_submittals_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_submittals_project_number_unique` UNIQUE(`projectId`,`submittalNumber`)
);
--> statement-breakpoint
CREATE TABLE `design_transmittal_items` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`transmittalId` varchar(36) NOT NULL,
	`revisionId` varchar(36) NOT NULL,
	CONSTRAINT `design_transmittal_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_transmittal_items_unique` UNIQUE(`transmittalId`,`revisionId`)
);
--> statement-breakpoint
CREATE TABLE `design_transmittals` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`projectId` varchar(36) NOT NULL,
	`transmittalNumber` varchar(120) NOT NULL,
	`direction` enum('outgoing','incoming') NOT NULL DEFAULT 'outgoing',
	`counterparty` varchar(255) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`status` enum('draft','sent','acknowledged') NOT NULL DEFAULT 'draft',
	`sentAt` timestamp,
	`acknowledgedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `design_transmittals_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_transmittals_project_number_unique` UNIQUE(`projectId`,`transmittalNumber`)
);
--> statement-breakpoint
ALTER TABLE `design_comments` ADD CONSTRAINT `design_comments_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_comments` ADD CONSTRAINT `design_comments_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_comments` ADD CONSTRAINT `design_comments_drawingId_design_drawings_id_fk` FOREIGN KEY (`drawingId`) REFERENCES `design_drawings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_comments` ADD CONSTRAINT `design_comments_revisionId_design_drawing_revisions_id_fk` FOREIGN KEY (`revisionId`) REFERENCES `design_drawing_revisions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_comments` ADD CONSTRAINT `design_comments_respondedByUserId_users_id_fk` FOREIGN KEY (`respondedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_comments` ADD CONSTRAINT `design_comments_closedByUserId_users_id_fk` FOREIGN KEY (`closedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_comments` ADD CONSTRAINT `design_comments_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_drawing_revisions` ADD CONSTRAINT `design_drawing_revisions_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_drawing_revisions` ADD CONSTRAINT `design_drawing_revisions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_drawing_revisions` ADD CONSTRAINT `design_drawing_revisions_drawingId_design_drawings_id_fk` FOREIGN KEY (`drawingId`) REFERENCES `design_drawings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_drawing_revisions` ADD CONSTRAINT `design_drawing_revisions_issuedByUserId_users_id_fk` FOREIGN KEY (`issuedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_drawing_revisions` ADD CONSTRAINT `design_drawing_revisions_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_drawings` ADD CONSTRAINT `design_drawings_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_drawings` ADD CONSTRAINT `design_drawings_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_drawings` ADD CONSTRAINT `design_drawings_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_submittals` ADD CONSTRAINT `design_submittals_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_submittals` ADD CONSTRAINT `design_submittals_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_submittals` ADD CONSTRAINT `design_submittals_drawingId_design_drawings_id_fk` FOREIGN KEY (`drawingId`) REFERENCES `design_drawings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_submittals` ADD CONSTRAINT `design_submittals_submittedByUserId_users_id_fk` FOREIGN KEY (`submittedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_submittals` ADD CONSTRAINT `design_submittals_repliedByUserId_users_id_fk` FOREIGN KEY (`repliedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_submittals` ADD CONSTRAINT `design_submittals_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_transmittal_items` ADD CONSTRAINT `design_transmittal_items_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_transmittal_items` ADD CONSTRAINT `design_transmittal_items_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_transmittal_items` ADD CONSTRAINT `design_transmittal_items_transmittalId_design_transmittals_id_fk` FOREIGN KEY (`transmittalId`) REFERENCES `design_transmittals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_transmittal_items` ADD CONSTRAINT `design_trm_items_revision_fk` FOREIGN KEY (`revisionId`) REFERENCES `design_drawing_revisions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_transmittals` ADD CONSTRAINT `design_transmittals_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_transmittals` ADD CONSTRAINT `design_transmittals_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_transmittals` ADD CONSTRAINT `design_transmittals_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `design_comments_tenant_project_status_idx` ON `design_comments` (`tenantId`,`projectId`,`status`,`dueAt`);--> statement-breakpoint
CREATE INDEX `design_comments_drawing_idx` ON `design_comments` (`drawingId`,`status`);--> statement-breakpoint
CREATE INDEX `design_revisions_tenant_project_idx` ON `design_drawing_revisions` (`tenantId`,`projectId`,`drawingId`);--> statement-breakpoint
CREATE INDEX `design_drawings_tenant_project_status_idx` ON `design_drawings` (`tenantId`,`projectId`,`status`,`discipline`);--> statement-breakpoint
CREATE INDEX `design_submittals_tenant_project_status_idx` ON `design_submittals` (`tenantId`,`projectId`,`status`,`dueAt`);--> statement-breakpoint
CREATE INDEX `design_transmittal_items_revision_idx` ON `design_transmittal_items` (`revisionId`);--> statement-breakpoint
CREATE INDEX `design_transmittals_tenant_project_status_idx` ON `design_transmittals` (`tenantId`,`projectId`,`status`);--> statement-breakpoint
-- The company owner holds every power by definition. Companies created before this migration have an owner role without the four design powers
-- (the catalog is read when a company is created), so they are granted here once; new companies get them from the catalog.
INSERT INTO `permissions` (`id`, `code`, `name`, `productCode`)
SELECT UUID(), v.code, v.name, 'PROJECT' FROM (
  SELECT 'project.design.manage' AS code, 'Manage the drawing register, transmittals, design comments and submittals' AS name
  UNION ALL SELECT 'project.design.architectural', 'Coordinate architectural drawings (architecture, interior, landscape)'
  UNION ALL SELECT 'project.design.technical', 'Coordinate technical drawings (structure, civil, MEP, fire)'
  UNION ALL SELECT 'project.design.approve', 'Approve drawings for construction and record consultant replies'
) v WHERE NOT EXISTS (SELECT 1 FROM `permissions` p WHERE p.`code` = v.code);
--> statement-breakpoint
INSERT INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id` FROM `roles` r INNER JOIN `permissions` p ON p.`code` IN ('project.design.manage', 'project.design.architectural', 'project.design.technical', 'project.design.approve')
WHERE r.`code` = 'TENANT_OWNER' AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp WHERE rp.`roleId` = r.`id` AND rp.`permissionId` = p.`id`);
