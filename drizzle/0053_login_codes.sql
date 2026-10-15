CREATE TABLE `login_codes` (
	`id` varchar(36) NOT NULL,
	`emailHash` varchar(64) NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `login_codes_email_created_idx` ON `login_codes` (`emailHash`,`createdAt`);