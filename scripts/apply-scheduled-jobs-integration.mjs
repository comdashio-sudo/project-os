import mysql from "mysql2/promise";

const url = new URL(process.env.DATABASE_URL);
url.pathname = "/project_os_integration_test";
const connection = await mysql.createConnection(url.toString());
await connection.execute("CREATE TABLE IF NOT EXISTS `scheduled_jobs` (`id` varchar(64) NOT NULL, `purpose` enum('license_lifecycle') NOT NULL, `scheduleCronTaskUid` varchar(65), `enabled` boolean NOT NULL DEFAULT true, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `scheduled_jobs_id` PRIMARY KEY(`id`), CONSTRAINT `scheduled_jobs_scheduleCronTaskUid_unique` UNIQUE(`scheduleCronTaskUid`))");
await connection.execute("CREATE INDEX `scheduled_jobs_task_uid_idx` ON `scheduled_jobs` (`scheduleCronTaskUid`)").catch(error => { if (error.code !== "ER_DUP_KEYNAME") throw error; });
await connection.end();
