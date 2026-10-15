CREATE TABLE `client_requests` (
	`id` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(60) NOT NULL,
	`status` enum('started','done') NOT NULL DEFAULT 'started',
	`resultJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `client_requests` ADD CONSTRAINT `client_requests_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_requests` ADD CONSTRAINT `client_requests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `client_requests_tenant_created_idx` ON `client_requests` (`tenantId`,`createdAt`);