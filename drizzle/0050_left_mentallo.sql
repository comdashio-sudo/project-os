ALTER TABLE `boq_items` DROP FOREIGN KEY `boq_items_tenantId_companies_id_fk`;
--> statement-breakpoint
ALTER TABLE `boq_items` DROP FOREIGN KEY `boq_items_projectId_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `boq_items` DROP FOREIGN KEY `boq_items_wbsItemId_wbs_items_id_fk`;
--> statement-breakpoint
ALTER TABLE `boq_items` DROP FOREIGN KEY `boq_items_createdByUserId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `project_commercial_invoices` DROP FOREIGN KEY `project_commercial_invoices_tenantId_companies_id_fk`;
--> statement-breakpoint
ALTER TABLE `project_commercial_invoices` DROP FOREIGN KEY `project_commercial_invoices_projectId_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `project_commercial_invoices` DROP FOREIGN KEY `project_commercial_invoices_createdByUserId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_certificate_lines` DROP FOREIGN KEY `subcontract_cert_lines_certificate_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_certificate_lines` DROP FOREIGN KEY `subcontract_certificate_lines_boqItemId_boq_items_id_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_certificates` DROP FOREIGN KEY `subcontract_certificates_tenantId_companies_id_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_certificates` DROP FOREIGN KEY `subcontract_certificates_projectId_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_certificates` DROP FOREIGN KEY `subcontract_certificates_contract_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_certificates` DROP FOREIGN KEY `subcontract_certificates_approvedByUserId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_certificates` DROP FOREIGN KEY `subcontract_certificates_createdByUserId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_contracts` DROP FOREIGN KEY `subcontract_contracts_tenantId_companies_id_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_contracts` DROP FOREIGN KEY `subcontract_contracts_projectId_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `subcontract_contracts` DROP FOREIGN KEY `subcontract_contracts_createdByUserId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `boq_items` ADD CONSTRAINT `boq_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `boq_items` ADD CONSTRAINT `boq_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `boq_items` ADD CONSTRAINT `boq_wbs_fk` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `boq_items` ADD CONSTRAINT `boq_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_commercial_invoices` ADD CONSTRAINT `proinv_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_commercial_invoices` ADD CONSTRAINT `proinv_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_commercial_invoices` ADD CONSTRAINT `proinv_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificate_lines` ADD CONSTRAINT `subline_cert_fk` FOREIGN KEY (`certificateId`) REFERENCES `subcontract_certificates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificate_lines` ADD CONSTRAINT `subline_boq_fk` FOREIGN KEY (`boqItemId`) REFERENCES `boq_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcert_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcert_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcert_contract_fk` FOREIGN KEY (`subcontractId`) REFERENCES `subcontract_contracts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcert_approver_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_certificates` ADD CONSTRAINT `subcert_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_contracts` ADD CONSTRAINT `subcon_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_contracts` ADD CONSTRAINT `subcon_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcontract_contracts` ADD CONSTRAINT `subcon_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;