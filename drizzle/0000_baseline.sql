CREATE TYPE "public"."actions_escalation_status" AS ENUM('none', 'pending', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."actions_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."actions_status" AS ENUM('open', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."activities_status" AS ENUM('not_started', 'in_progress', 'completed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."boq_items_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."change_requests_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."claims_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."client_requests_status" AS ENUM('started', 'done');--> statement-breakpoint
CREATE TYPE "public"."commercial_features_product_code" AS ENUM('EXECUTIVE', 'PMO', 'PROJECT');--> statement-breakpoint
CREATE TYPE "public"."commercial_plans_package_code" AS ENUM('EXECUTIVE', 'PMO', 'PROJECT', 'EXECUTIVE + PMO', 'PMO + PROJECT', 'EXECUTIVE + PROJECT', 'ALL-IN-ONE');--> statement-breakpoint
CREATE TYPE "public"."commitments_status" AS ENUM('draft', 'committed', 'released', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."companies_default_locale" AS ENUM('ar', 'en');--> statement-breakpoint
CREATE TYPE "public"."companies_status" AS ENUM('active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."consultant_submittals_status" AS ENUM('draft', 'sent', 'replied', 'closed');--> statement-breakpoint
CREATE TYPE "public"."consultant_submittals_type" AS ENUM('shop_drawing', 'material_approval', 'method_statement', 'sample');--> statement-breakpoint
CREATE TYPE "public"."contracts_counterparty_kind" AS ENUM('client', 'supplier', 'other');--> statement-breakpoint
CREATE TYPE "public"."contracts_status" AS ENUM('draft', 'active', 'suspended', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."control_record_links_source_type" AS ENUM('risk', 'issue', 'action', 'decision');--> statement-breakpoint
CREATE TYPE "public"."control_record_links_target_type" AS ENUM('risk', 'issue', 'action', 'decision', 'rfi', 'ncr');--> statement-breakpoint
CREATE TYPE "public"."cost_entries_category" AS ENUM('materials', 'labour', 'subcontract', 'other');--> statement-breakpoint
CREATE TYPE "public"."cost_entries_entry_type" AS ENUM('actual', 'accrual', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."cost_entries_status" AS ENUM('draft', 'posted', 'void');--> statement-breakpoint
CREATE TYPE "public"."data_import_errors_severity" AS ENUM('error', 'warning');--> statement-breakpoint
CREATE TYPE "public"."data_import_row_results_action" AS ENUM('created', 'updated', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."data_imports_duplicate_mode" AS ENUM('create_only', 'update_existing', 'upsert', 'skip_duplicates', 'fail_on_duplicate');--> statement-breakpoint
CREATE TYPE "public"."data_imports_source_format" AS ENUM('xlsx', 'csv', 'xer');--> statement-breakpoint
CREATE TYPE "public"."data_imports_status" AS ENUM('uploaded', 'analyzing', 'validated', 'confirmed', 'importing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."decisions_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'implemented');--> statement-breakpoint
CREATE TYPE "public"."design_comments_severity" AS ENUM('minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "public"."design_comments_status" AS ENUM('open', 'responded', 'closed');--> statement-breakpoint
CREATE TYPE "public"."design_drawings_discipline" AS ENUM('architectural', 'interior', 'landscape', 'structural', 'civil', 'mechanical', 'electrical', 'plumbing', 'fire_fighting', 'other');--> statement-breakpoint
CREATE TYPE "public"."design_drawings_status" AS ENUM('registered', 'under_review', 'approved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."design_submittals_discipline" AS ENUM('architectural', 'interior', 'landscape', 'structural', 'civil', 'mechanical', 'electrical', 'plumbing', 'fire_fighting', 'other');--> statement-breakpoint
CREATE TYPE "public"."design_submittals_reply_code" AS ENUM('A', 'B', 'C', 'D');--> statement-breakpoint
CREATE TYPE "public"."design_submittals_status" AS ENUM('draft', 'submitted', 'replied', 'closed');--> statement-breakpoint
CREATE TYPE "public"."design_transmittals_direction" AS ENUM('outgoing', 'incoming');--> statement-breakpoint
CREATE TYPE "public"."design_transmittals_status" AS ENUM('draft', 'sent', 'acknowledged');--> statement-breakpoint
CREATE TYPE "public"."email_notification_preferences_kind" AS ENUM('support_escalation', 'approvals_waiting', 'daily_digest');--> statement-breakpoint
CREATE TYPE "public"."email_outbox_kind" AS ENUM('support_escalation', 'approvals_waiting', 'daily_digest');--> statement-breakpoint
CREATE TYPE "public"."email_outbox_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."employee_assignments_status" AS ENUM('planned', 'active', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."employee_attendance_attendance_status" AS ENUM('present', 'absent', 'leave', 'secondment');--> statement-breakpoint
CREATE TYPE "public"."employee_attendance_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."employee_performance_exclusions_source_type" AS ENUM('activity', 'action', 'rfi', 'ncr', 'quality_inspection', 'field_report', 'material_request');--> statement-breakpoint
CREATE TYPE "public"."employee_performance_objections_status" AS ENUM('submitted', 'under_review', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."employee_time_entries_rate_source" AS ENUM('loaded', 'resource');--> statement-breakpoint
CREATE TYPE "public"."employee_time_entries_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."employees_employment_status" AS ENUM('active', 'suspended', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."employees_retention_policy" AS ENUM('standard', 'extended', 'legal_hold');--> statement-breakpoint
CREATE TYPE "public"."employment_contracts_contract_type" AS ENUM('permanent', 'fixed_term', 'temporary', 'consulting');--> statement-breakpoint
CREATE TYPE "public"."employment_contracts_retention_policy" AS ENUM('standard', 'extended', 'legal_hold');--> statement-breakpoint
CREATE TYPE "public"."employment_contracts_status" AS ENUM('active', 'ended', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."evm_snapshots_eac_method" AS ENUM('bac_over_cpi', 'ac_plus_remaining', 'ac_plus_remaining_over_cpi_spi', 'manual');--> statement-breakpoint
CREATE TYPE "public"."field_reports_report_type" AS ENUM('daily', 'inspection', 'progress');--> statement-breakpoint
CREATE TYPE "public"."field_reports_shift" AS ENUM('day', 'night');--> statement-breakpoint
CREATE TYPE "public"."field_reports_status" AS ENUM('draft', 'submitted', 'reviewed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."goods_receipt_notes_receipt_mode" AS ENUM('warehouse_stock', 'direct_to_site');--> statement-breakpoint
CREATE TYPE "public"."hse_observations_category" AS ENUM('safety', 'health', 'environment');--> statement-breakpoint
CREATE TYPE "public"."hse_observations_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."hse_observations_status" AS ENUM('open', 'assigned', 'remediation', 'verification', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."integration_sync_runs_status" AS ENUM('running', 'ok', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."invoices_renderer" AS ENUM('structured_json');--> statement-breakpoint
CREATE TYPE "public"."invoices_status" AS ENUM('issued', 'void');--> statement-breakpoint
CREATE TYPE "public"."issues_escalation_status" AS ENUM('none', 'pending', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."issues_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."issues_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_articles_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."master_plan_snapshots_metric" AS ENUM('progress', 'status', 'cost', 'risk', 'quality', 'hse', 'production', 'custom');--> statement-breakpoint
CREATE TYPE "public"."master_plan_spatial_entities_entity_type" AS ENUM('block', 'building', 'zone', 'unit', 'area');--> statement-breakpoint
CREATE TYPE "public"."master_plan_spatial_entities_status" AS ENUM('not_started', 'in_progress', 'completed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."master_plan_versions_version_kind" AS ENUM('original', 'revision', 'updated');--> statement-breakpoint
CREATE TYPE "public"."master_plan_visualization_rules_metric" AS ENUM('progress', 'status', 'cost');--> statement-breakpoint
CREATE TYPE "public"."master_plans_status" AS ENUM('active', 'superseded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."membership_invitations_scope_type" AS ENUM('company', 'portfolio', 'program', 'project');--> statement-breakpoint
CREATE TYPE "public"."membership_invitations_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."membership_roles_scope_type" AS ENUM('company', 'portfolio', 'program', 'project');--> statement-breakpoint
CREATE TYPE "public"."memberships_status" AS ENUM('invited', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."ncrs_status" AS ENUM('open', 'under_investigation', 'corrective_action', 'verification', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_records_operation" AS ENUM('create', 'renew', 'cancel', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payment_records_provider" AS ENUM('manual', 'mock');--> statement-breakpoint
CREATE TYPE "public"."payment_records_status" AS ENUM('pending', 'confirmed', 'cancelled', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payroll_allocations_source" AS ENUM('manual', 'auto_hours');--> statement-breakpoint
CREATE TYPE "public"."payroll_runs_status" AS ENUM('draft', 'review', 'approved', 'paid');--> statement-breakpoint
CREATE TYPE "public"."permissions_product_code" AS ENUM('EXECUTIVE', 'PMO', 'PROJECT');--> statement-breakpoint
CREATE TYPE "public"."pmc_inspection_requests_response_code" AS ENUM('A', 'B', 'C', 'UR');--> statement-breakpoint
CREATE TYPE "public"."pmc_inspection_steps_status" AS ENUM('pending', 'in_progress', 'complete', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pmc_status_factors_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."pmc_unit_activity_history_from_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."pmc_unit_activity_history_to_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."pmc_unit_activity_progress_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."portfolios_status" AS ENUM('active', 'on_hold', 'closed');--> statement-breakpoint
CREATE TYPE "public"."procurement_requisitions_status" AS ENUM('draft', 'submitted', 'approved', 'partially_issued', 'closed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."programs_status" AS ENUM('active', 'on_hold', 'closed');--> statement-breakpoint
CREATE TYPE "public"."progress_entries_status" AS ENUM('draft', 'submitted', 'validated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."project_commercial_invoices_status" AS ENUM('draft', 'issued', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."project_documents_category" AS ENUM('drawing', 'specification', 'method_statement', 'report', 'correspondence', 'commercial', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_documents_status" AS ENUM('draft', 'for_review', 'approved', 'superseded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_health_snapshots_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."project_health_snapshots_status" AS ENUM('green', 'amber', 'red');--> statement-breakpoint
CREATE TYPE "public"."project_resources_resource_type" AS ENUM('labor', 'equipment', 'material', 'service');--> statement-breakpoint
CREATE TYPE "public"."projects_lifecycle_stage" AS ENUM('opportunity', 'pre_award', 'tender', 'award', 'mobilization', 'planning', 'design', 'procurement', 'execution', 'commissioning', 'handover', 'closeout', 'post_project_review');--> statement-breakpoint
CREATE TYPE "public"."projects_status" AS ENUM('draft', 'active', 'on_hold', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."purchase_orders_status" AS ENUM('draft', 'submitted', 'approved', 'issued', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."quality_inspections_inspection_type" AS ENUM('hold_point', 'witness', 'surveillance', 'testing');--> statement-breakpoint
CREATE TYPE "public"."quality_inspections_outcome" AS ENUM('pass', 'fail', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."quality_inspections_status" AS ENUM('draft', 'submitted', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."rfis_status" AS ENUM('draft', 'submitted', 'under_review', 'answered', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."risks_status" AS ENUM('open', 'mitigating', 'accepted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."roles_product_code" AS ENUM('EXECUTIVE', 'PMO', 'PROJECT');--> statement-breakpoint
CREATE TYPE "public"."salary_structures_eos_accrual_mode" AS ENUM('computed', 'manual');--> statement-breakpoint
CREATE TYPE "public"."scheduled_jobs_purpose" AS ENUM('license_lifecycle');--> statement-breakpoint
CREATE TYPE "public"."site_daily_report_lines_line_type" AS ENUM('labour', 'equipment', 'work');--> statement-breakpoint
CREATE TYPE "public"."site_daily_reports_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."subcontract_certificates_status" AS ENUM('draft', 'submitted', 'approved', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subcontract_contracts_status" AS ENUM('draft', 'active', 'suspended', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subscriptions_package_code" AS ENUM('EXECUTIVE', 'PMO', 'PROJECT', 'EXECUTIVE + PMO', 'PMO + PROJECT', 'EXECUTIVE + PROJECT', 'ALL-IN-ONE');--> statement-breakpoint
CREATE TYPE "public"."subscriptions_status" AS ENUM('trialing', 'active', 'past_due', 'suspended', 'cancelled', 'expired', 'grace_period');--> statement-breakpoint
CREATE TYPE "public"."support_messages_sender_type" AS ENUM('customer', 'agent', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."support_tickets_category" AS ENUM('technical', 'billing', 'account', 'general');--> statement-breakpoint
CREATE TYPE "public"."support_tickets_escalation_status" AS ENUM('none', 'requested', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."support_tickets_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."support_tickets_status" AS ENUM('open', 'waiting_customer', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."tenant_entitlements_product_code" AS ENUM('EXECUTIVE', 'PMO', 'PROJECT');--> statement-breakpoint
CREATE TYPE "public"."tenant_licenses_status" AS ENUM('trialing', 'active', 'past_due', 'suspended', 'cancelled', 'expired', 'grace_period');--> statement-breakpoint
CREATE TYPE "public"."tenant_policies_mode" AS ENUM('off', 'warn', 'block');--> statement-breakpoint
CREATE TYPE "public"."tender_bid_adjustments_kind" AS ENUM('scope_gap', 'exclusion', 'correction', 'discount');--> statement-breakpoint
CREATE TYPE "public"."tender_bids_status" AS ENUM('submitted', 'withdrawn', 'disqualified');--> statement-breakpoint
CREATE TYPE "public"."tender_invitees_status" AS ENUM('invited', 'declined', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."tender_packages_status" AS ENUM('draft', 'open', 'closed', 'awarded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."users_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."warehouse_inventory_transactions_transaction_type" AS ENUM('receipt', 'issue', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."webhook_deliveries_status" AS ENUM('pending', 'delivered', 'failed');--> statement-breakpoint
CREATE TABLE "actions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"title" varchar(255) NOT NULL,
	"description" text,
	"priority" "actions_priority" DEFAULT 'medium' NOT NULL,
	"owner_membership_id" varchar(36),
	"due_at" timestamp with time zone,
	"evidence_document_id" varchar(36),
	"escalation_status" "actions_escalation_status" DEFAULT 'none' NOT NULL,
	"status" "actions_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36),
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "activities_status" DEFAULT 'not_started' NOT NULL,
	"planned_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"earned_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"planned_start_at" timestamp with time zone,
	"planned_finish_at" timestamp with time zone,
	"actual_start_at" timestamp with time zone,
	"actual_finish_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"scopes" varchar(400) NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 120 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_rate_windows" (
	"key_id" varchar(36) NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_rate_windows_key_id_window_start_pk" PRIMARY KEY("key_id","window_start")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"actor_user_id" integer,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(120) NOT NULL,
	"entity_id" varchar(36),
	"request_id" varchar(80),
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_code_attempts" (
	"email_hash" varchar(64) PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "boq_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36),
	"code" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"unit_of_measure" varchar(40) NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_rate" numeric(18, 2) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"status" "boq_items_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36),
	"cost_code" varchar(80) NOT NULL,
	"original_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"current_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"change_number" varchar(120) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"impact_schedule_days" integer DEFAULT 0 NOT NULL,
	"impact_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"contract_value_impact" numeric(18, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"status" "change_requests_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"contract_id" varchar(36),
	"claim_number" varchar(120) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"claimed_amount" numeric(18, 2) NOT NULL,
	"approved_amount" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"status" "claims_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"action" varchar(60) NOT NULL,
	"status" "client_requests_status" DEFAULT 'started' NOT NULL,
	"result_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_features" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"code" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"product_code" "commercial_features_product_code" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_plans" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"package_code" "commercial_plans_package_code" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"contract_id" varchar(36),
	"code" varchar(80) NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"status" "commitments_status" DEFAULT 'draft' NOT NULL,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"status" "companies_status" DEFAULT 'active' NOT NULL,
	"default_locale" "companies_default_locale" DEFAULT 'ar' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultant_submittals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"submittal_type" "consultant_submittals_type" NOT NULL,
	"submittal_number" varchar(120) NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "consultant_submittals_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"reply_code" varchar(8),
	"reply_note" varchar(500),
	"pmc_activity_definition_id" varchar(36),
	"pmc_unit_id" varchar(36),
	"material_id" varchar(36),
	"created_by_user_id" integer NOT NULL,
	"sent_by_user_id" integer,
	"replied_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"title" varchar(255) NOT NULL,
	"counterparty" varchar(255) NOT NULL,
	"counterparty_kind" "contracts_counterparty_kind" DEFAULT 'other' NOT NULL,
	"supplier_id" varchar(36),
	"contract_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"status" "contracts_status" DEFAULT 'draft' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_record_links" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"source_type" "control_record_links_source_type" NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"target_type" "control_record_links_target_type" NOT NULL,
	"target_id" varchar(36) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36),
	"amount" numeric(18, 2) NOT NULL,
	"entry_type" "cost_entries_entry_type" NOT NULL,
	"status" "cost_entries_status" DEFAULT 'draft' NOT NULL,
	"incurred_at" timestamp with time zone NOT NULL,
	"category" "cost_entries_category" DEFAULT 'other' NOT NULL,
	"source_type" varchar(40),
	"source_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_import_errors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"import_id" varchar(36) NOT NULL,
	"row_number" integer NOT NULL,
	"column_name" varchar(128),
	"value" text,
	"code" varchar(96) NOT NULL,
	"severity" "data_import_errors_severity" NOT NULL,
	"suggested_fix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_import_row_results" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"import_id" varchar(36) NOT NULL,
	"row_number" integer NOT NULL,
	"row_key" varchar(160) NOT NULL,
	"action" "data_import_row_results_action" NOT NULL,
	"entity_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_imports" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"module_code" varchar(64) NOT NULL,
	"template_code" varchar(64) NOT NULL,
	"source_format" "data_imports_source_format" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_key" varchar(512) NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"status" "data_imports_status" DEFAULT 'uploaded' NOT NULL,
	"duplicate_mode" "data_imports_duplicate_mode" DEFAULT 'fail_on_duplicate' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"created_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"mapping_json" text,
	"summary_json" text,
	"created_by_user_id" integer NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"progress_stage" varchar(32),
	"failure_reason" varchar(128),
	"heartbeat_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"problem" text NOT NULL,
	"options" text NOT NULL,
	"recommendation" text,
	"cost_impact" numeric(18, 2),
	"schedule_impact_days" integer,
	"risk_impact" text,
	"decision_owner_membership_id" varchar(36),
	"decision" text,
	"status" "decisions_status" DEFAULT 'draft' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_comments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"drawing_id" varchar(36) NOT NULL,
	"revision_id" varchar(36) NOT NULL,
	"comment_number" varchar(120) NOT NULL,
	"raised_by" varchar(255) NOT NULL,
	"severity" "design_comments_severity" DEFAULT 'minor' NOT NULL,
	"comment_text" text NOT NULL,
	"status" "design_comments_status" DEFAULT 'open' NOT NULL,
	"response_text" text,
	"responded_at" timestamp with time zone,
	"responded_by_user_id" integer,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" integer,
	"due_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_drawing_revisions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"drawing_id" varchar(36) NOT NULL,
	"revision" varchar(20) NOT NULL,
	"description" varchar(500),
	"is_current" boolean DEFAULT true NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" integer NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "design_drawings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"drawing_number" varchar(120) NOT NULL,
	"title" varchar(255) NOT NULL,
	"discipline" "design_drawings_discipline" NOT NULL,
	"status" "design_drawings_status" DEFAULT 'registered' NOT NULL,
	"current_revision" varchar(20) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_submittals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"submittal_number" varchar(120) NOT NULL,
	"title" varchar(255) NOT NULL,
	"discipline" "design_submittals_discipline" NOT NULL,
	"drawing_id" varchar(36),
	"resubmission_of_id" varchar(36),
	"status" "design_submittals_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by_user_id" integer,
	"due_at" timestamp with time zone,
	"reply_code" "design_submittals_reply_code",
	"reply_note" text,
	"replied_at" timestamp with time zone,
	"replied_by_user_id" integer,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_transmittal_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"transmittal_id" varchar(36) NOT NULL,
	"revision_id" varchar(36) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_transmittals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"transmittal_number" varchar(120) NOT NULL,
	"direction" "design_transmittals_direction" DEFAULT 'outgoing' NOT NULL,
	"counterparty" varchar(255) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"status" "design_transmittals_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"document_id" varchar(36) NOT NULL,
	"version_number" integer NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"uploaded_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_notification_preferences" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"kind" "email_notification_preferences_kind" NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"recipient_user_id" integer NOT NULL,
	"kind" "email_outbox_kind" NOT NULL,
	"dedupe_key" varchar(160) NOT NULL,
	"subject" varchar(300) NOT NULL,
	"body_text" text NOT NULL,
	"body_html" text NOT NULL,
	"status" "email_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "employee_assignments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"project_resource_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36),
	"activity_id" varchar(36),
	"planned_start_at" timestamp with time zone NOT NULL,
	"planned_finish_at" timestamp with time zone NOT NULL,
	"planned_hours" numeric(12, 2) NOT NULL,
	"status" "employee_assignments_status" DEFAULT 'planned' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_attendance" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"attendance_date" timestamp with time zone NOT NULL,
	"attendance_status" "employee_attendance_attendance_status" NOT NULL,
	"status" "employee_attendance_status" DEFAULT 'draft' NOT NULL,
	"note" varchar(1000),
	"created_by_user_id" integer NOT NULL,
	"reviewed_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_performance_exclusions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"source_type" "employee_performance_exclusions_source_type" NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_performance_objections" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"statement" text NOT NULL,
	"status" "employee_performance_objections_status" DEFAULT 'submitted' NOT NULL,
	"resolution_note" varchar(1000),
	"created_by_user_id" integer NOT NULL,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_time_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assignment_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"work_date" timestamp with time zone NOT NULL,
	"actual_hours" numeric(8, 2) NOT NULL,
	"reported_progress_percent" numeric(5, 2),
	"status" "employee_time_entries_status" DEFAULT 'draft' NOT NULL,
	"cost_entry_id" varchar(36),
	"rate_source" "employee_time_entries_rate_source",
	"progress_entry_id" varchar(36),
	"superseded_by_payroll_entry_id" varchar(36),
	"created_by_user_id" integer NOT NULL,
	"reviewed_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_number" varchar(80) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"job_title" varchar(160) NOT NULL,
	"department" varchar(160) NOT NULL,
	"hire_date" timestamp with time zone NOT NULL,
	"employment_status" "employees_employment_status" DEFAULT 'active' NOT NULL,
	"nationality" varchar(120),
	"identity_document_type" varchar(80),
	"identity_reference" varchar(512),
	"linked_user_id" integer,
	"retention_policy" "employees_retention_policy" DEFAULT 'standard' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employment_contracts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"contract_type" "employment_contracts_contract_type" NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"probation_end_date" timestamp with time zone,
	"renewal_of_contract_id" varchar(36),
	"status" "employment_contracts_status" DEFAULT 'active' NOT NULL,
	"termination_reason" varchar(1000),
	"retention_policy" "employment_contracts_retention_policy" DEFAULT 'standard' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evm_snapshots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"period_at" timestamp with time zone NOT NULL,
	"pv" numeric(18, 2) NOT NULL,
	"ev" numeric(18, 2) NOT NULL,
	"ac" numeric(18, 2) NOT NULL,
	"bac" numeric(18, 2) NOT NULL,
	"cv" numeric(18, 2) NOT NULL,
	"sv" numeric(18, 2) NOT NULL,
	"cpi" numeric(12, 4),
	"spi" numeric(12, 4),
	"eac" numeric(18, 2) NOT NULL,
	"etc" numeric(18, 2) NOT NULL,
	"vac" numeric(18, 2) NOT NULL,
	"tcpi" numeric(12, 4),
	"eac_method" "evm_snapshots_eac_method" NOT NULL,
	"adjusted_contract_value" numeric(18, 2),
	"fpac" numeric(18, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evm_wbs_snapshots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"snapshot_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36),
	"bac" numeric(18, 2) NOT NULL,
	"ac" numeric(18, 2) NOT NULL,
	"eac" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_reports" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_number" varchar(120) NOT NULL,
	"report_type" "field_reports_report_type" NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"shift" "field_reports_shift" DEFAULT 'day' NOT NULL,
	"workforce_count" integer DEFAULT 0 NOT NULL,
	"weather" varchar(160),
	"summary" text NOT NULL,
	"status" "field_reports_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_notes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"purchase_order_id" varchar(36) NOT NULL,
	"material_id" varchar(36) NOT NULL,
	"quality_inspection_id" varchar(36),
	"ncr_id" varchar(36),
	"grn_number" varchar(120) NOT NULL,
	"received_quantity" numeric(18, 3) NOT NULL,
	"rejected_quantity" numeric(18, 3) NOT NULL,
	"unit_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"unit_of_measure" varchar(40) NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"note" text,
	"cost_entry_id" varchar(36),
	"receipt_mode" "goods_receipt_notes_receipt_mode" DEFAULT 'direct_to_site' NOT NULL,
	"warehouse_id" varchar(36),
	"inventory_transaction_id" varchar(36),
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hse_observations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"observation_number" varchar(120) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" "hse_observations_category" NOT NULL,
	"severity" "hse_observations_severity" DEFAULT 'medium' NOT NULL,
	"status" "hse_observations_status" DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"system" varchar(24) NOT NULL,
	"name" varchar(120) NOT NULL,
	"base_url" varchar(300) NOT NULL,
	"database" varchar(120),
	"username" varchar(160),
	"secret_sealed" text,
	"settings" text,
	"active" boolean DEFAULT true NOT NULL,
	"scheduled_daily" boolean DEFAULT false NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_inbound_records" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"system" varchar(24) NOT NULL,
	"entity_type" varchar(24) NOT NULL,
	"external_id" varchar(120) NOT NULL,
	"payload" text NOT NULL,
	"run_id" varchar(36),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_mappings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"system" varchar(24) NOT NULL,
	"entity_type" varchar(24) NOT NULL,
	"external_id" varchar(120) NOT NULL,
	"internal_id" varchar(36),
	"internal_code" varchar(120),
	"payload_hash" varchar(64),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_sync_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"entity_type" varchar(24) NOT NULL,
	"external_id" varchar(120),
	"outcome" varchar(12) NOT NULL,
	"reason" varchar(80),
	"detail" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_sync_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"system" varchar(24) NOT NULL,
	"direction" varchar(4) NOT NULL,
	"trigger" varchar(12) NOT NULL,
	"entity_type" varchar(24),
	"status" "integration_sync_runs_status" DEFAULT 'running' NOT NULL,
	"received" integer DEFAULT 0 NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"api_key_id" varchar(36),
	"started_by_user_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_summary" varchar(300)
);
--> statement-breakpoint
CREATE TABLE "internal_notifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"recipient_user_id" integer NOT NULL,
	"project_id" varchar(36),
	"notification_code" varchar(120) NOT NULL,
	"entity_type" varchar(120),
	"entity_id" varchar(36),
	"payload" text NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"next_number" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"subscription_id" varchar(36) NOT NULL,
	"sequence_number" integer NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"status" "invoices_status" DEFAULT 'issued' NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"seller_name" varchar(255) NOT NULL,
	"seller_tax_number" varchar(80) NOT NULL,
	"buyer_name" varchar(255) NOT NULL,
	"buyer_tax_number" varchar(80) NOT NULL,
	"subtotal_amount" numeric(18, 2) NOT NULL,
	"vat_amount" numeric(18, 2) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"renderer" "invoices_renderer" DEFAULT 'structured_json' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"title" varchar(255) NOT NULL,
	"cause" text,
	"impact" text,
	"priority" "issues_priority" DEFAULT 'medium' NOT NULL,
	"owner_membership_id" varchar(36),
	"due_at" timestamp with time zone,
	"escalation_status" "issues_escalation_status" DEFAULT 'none' NOT NULL,
	"status" "issues_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_document_id" varchar(36) NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"status" "knowledge_articles_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"published_by_user_id" integer,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_plan_snapshots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"master_plan_version_id" varchar(36) NOT NULL,
	"label" varchar(160) NOT NULL,
	"metric" "master_plan_snapshots_metric" NOT NULL,
	"filters_json" text NOT NULL,
	"viewport_json" text NOT NULL,
	"layers_json" text NOT NULL,
	"shared_with_project" boolean DEFAULT false NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_plan_spatial_entities" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"master_plan_version_id" varchar(36) NOT NULL,
	"parent_entity_id" varchar(36),
	"code" varchar(120) NOT NULL,
	"name" varchar(255) NOT NULL,
	"entity_type" "master_plan_spatial_entities_entity_type" NOT NULL,
	"geometry" text NOT NULL,
	"status" "master_plan_spatial_entities_status" DEFAULT 'not_started' NOT NULL,
	"progress_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"planned_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"actual_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"forecast_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"wbs_item_id" varchar(36),
	"activity_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_plan_versions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"master_plan_id" varchar(36) NOT NULL,
	"version_number" integer NOT NULL,
	"version_kind" "master_plan_versions_version_kind" NOT NULL,
	"description" text,
	"change_summary" text,
	"source_file_name" varchar(255),
	"storage_key" varchar(512),
	"checksum_sha256" varchar(64),
	"rotation_degrees" integer DEFAULT 0 NOT NULL,
	"map_width_meters" numeric(12, 2),
	"map_height_meters" numeric(12, 2),
	"uploaded_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_plan_visualization_rules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"metric" "master_plan_visualization_rules_metric" NOT NULL,
	"rules_json" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_plans" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "master_plans_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_issues" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"inventory_transaction_id" varchar(36) NOT NULL,
	"cost_entry_id" varchar(36) NOT NULL,
	"material_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36) NOT NULL,
	"activity_id" varchar(36),
	"pmc_unit_id" varchar(36),
	"pmc_activity_definition_id" varchar(36),
	"issued_quantity" numeric(18, 3) NOT NULL,
	"unit_cost" numeric(18, 2) NOT NULL,
	"total_cost" numeric(18, 2) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_masters" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(120) NOT NULL,
	"description" varchar(255) NOT NULL,
	"unit_of_measure" varchar(40) NOT NULL,
	"category" varchar(120) NOT NULL,
	"reference_specification" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_returns" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"material_issue_id" varchar(36) NOT NULL,
	"inventory_transaction_id" varchar(36) NOT NULL,
	"cost_entry_id" varchar(36) NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_cost" numeric(18, 2) NOT NULL,
	"total_cost" numeric(18, 2) NOT NULL,
	"returned_at" timestamp with time zone NOT NULL,
	"reason" varchar(500) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_invitations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"email" varchar(320) NOT NULL,
	"role_id" varchar(36) NOT NULL,
	"scope_type" "membership_invitations_scope_type" NOT NULL,
	"scope_id" varchar(36),
	"token_hash" varchar(64) NOT NULL,
	"status" "membership_invitations_status" DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" integer NOT NULL,
	"accepted_by_user_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_roles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"membership_id" varchar(36) NOT NULL,
	"role_id" varchar(36) NOT NULL,
	"scope_type" "membership_roles_scope_type" DEFAULT 'company' NOT NULL,
	"scope_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"status" "memberships_status" DEFAULT 'invited' NOT NULL,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ncrs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"ncr_number" varchar(120) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"status" "ncrs_status" DEFAULT 'open' NOT NULL,
	"pmc_unit_id" varchar(36),
	"pmc_activity_definition_id" varchar(36),
	"due_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"subscription_id" varchar(36) NOT NULL,
	"invoice_id" varchar(36),
	"provider" "payment_records_provider" NOT NULL,
	"operation" "payment_records_operation" NOT NULL,
	"status" "payment_records_status" NOT NULL,
	"provider_reference" varchar(120) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"metadata" text,
	"confirmed_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_allocation_adjustments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"allocation_id" varchar(36) NOT NULL,
	"previous_amount" numeric(18, 2) NOT NULL,
	"new_amount" numeric(18, 2) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"adjusted_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_allocations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"payroll_entry_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36),
	"activity_id" varchar(36),
	"amount" numeric(18, 2) NOT NULL,
	"cost_entry_id" varchar(36),
	"source" "payroll_allocations_source" DEFAULT 'manual' NOT NULL,
	"hours_basis" numeric(12, 2),
	"share_percent" numeric(9, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"payroll_run_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"salary_structure_id" varchar(36) NOT NULL,
	"base_salary" numeric(18, 2) NOT NULL,
	"housing_allowance" numeric(18, 2) NOT NULL,
	"transport_allowance" numeric(18, 2) NOT NULL,
	"hardship_allowance" numeric(18, 2) NOT NULL,
	"gosi_deduction" numeric(18, 2) NOT NULL,
	"other_deductions" numeric(18, 2) NOT NULL,
	"eos_monthly_accrual" numeric(18, 2) NOT NULL,
	"employer_social_insurance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"indirect_loading" numeric(18, 2) DEFAULT '0' NOT NULL,
	"nationality_class" varchar(12),
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" "payroll_runs_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"reviewed_by_user_id" integer,
	"approved_by_user_id" integer,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"code" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"product_code" "permissions_product_code" NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_feature_entitlements" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"plan_id" varchar(36) NOT NULL,
	"feature_id" varchar(36) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"limit_value" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_activity_definitions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"group_id" varchar(36) NOT NULL,
	"stage_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36),
	"model_code" varchar(80) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"weight_percent" numeric(7, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_activity_groups" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_activity_stages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"group_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_baselines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"activity_definition_id" varchar(36) NOT NULL,
	"period_at" timestamp with time zone NOT NULL,
	"planned_percent" numeric(7, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_blocks" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"zone_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_inspection_request_units" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"inspection_request_id" varchar(36) NOT NULL,
	"unit_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_inspection_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"request_code" varchar(80) NOT NULL,
	"activity_definition_id" varchar(36) NOT NULL,
	"unit_ids_json" text,
	"contractor_label" varchar(255),
	"consultant_label" varchar(255),
	"response_code" "pmc_inspection_requests_response_code",
	"requested_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_inspection_steps" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"inspection_request_id" varchar(36) NOT NULL,
	"step_code" varchar(80) NOT NULL,
	"step_order" integer DEFAULT 0 NOT NULL,
	"holder_label" varchar(255),
	"status" "pmc_inspection_steps_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_site_plans" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"file_key" varchar(512) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"uploaded_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_status_factors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"status" "pmc_status_factors_status" NOT NULL,
	"factor" numeric(5, 4) NOT NULL,
	"updated_by_user_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_unit_activity_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"unit_activity_progress_id" varchar(36) NOT NULL,
	"from_status" "pmc_unit_activity_history_from_status",
	"to_status" "pmc_unit_activity_history_to_status" NOT NULL,
	"changed_by_user_id" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" varchar(1000)
);
--> statement-breakpoint
CREATE TABLE "pmc_unit_activity_progress" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"unit_id" varchar(36) NOT NULL,
	"activity_definition_id" varchar(36) NOT NULL,
	"status" "pmc_unit_activity_progress_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"verification_status_id" varchar(36),
	"assigned_user_id" integer,
	"last_changed_by_user_id" integer,
	"last_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_units" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"block_id" varchar(36) NOT NULL,
	"unit_number" integer NOT NULL,
	"model_code" varchar(80) NOT NULL,
	"sale_status" varchar(80),
	"geometry_json" text,
	"unit_weight" numeric(12, 4) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_verification_statuses" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"label" varchar(160) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"pending" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmc_zones" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "portfolios_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement_requisitions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"requisition_number" varchar(120) NOT NULL,
	"supplier_id" varchar(36),
	"material_id" varchar(36),
	"wbs_item_id" varchar(36),
	"activity_id" varchar(36),
	"purchase_order_id" varchar(36),
	"purchase_order_linked_at" timestamp with time zone,
	"purchase_order_linked_by_user_id" integer,
	"description" text NOT NULL,
	"requested_quantity" numeric(18, 3) NOT NULL,
	"unit_of_measure" varchar(40) NOT NULL,
	"required_at" timestamp with time zone NOT NULL,
	"status" "procurement_requisitions_status" DEFAULT 'draft' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"portfolio_id" varchar(36),
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "programs_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"wbs_item_id" varchar(36),
	"activity_id" varchar(36),
	"progress_percent" numeric(5, 2) NOT NULL,
	"status" "progress_entries_status" DEFAULT 'draft' NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_commercial_invoices" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"invoice_number" varchar(80) NOT NULL,
	"invoice_date" timestamp with time zone NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"vat_amount" numeric(18, 2) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"status" "project_commercial_invoices_status" DEFAULT 'draft' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"document_number" varchar(120) NOT NULL,
	"title" varchar(255) NOT NULL,
	"category" "project_documents_category" DEFAULT 'other' NOT NULL,
	"status" "project_documents_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_health_snapshots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"period_at" timestamp with time zone NOT NULL,
	"overall_score" numeric(5, 2) NOT NULL,
	"status" "project_health_snapshots_status" NOT NULL,
	"confidence" "project_health_snapshots_confidence" NOT NULL,
	"drivers" text NOT NULL,
	"exceptions" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_material_overrides" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"material_id" varchar(36) NOT NULL,
	"project_description" varchar(255),
	"reference_specification" varchar(255),
	"reorder_level" numeric(18, 3),
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_resources" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"resource_code" varchar(120) NOT NULL,
	"name" varchar(255) NOT NULL,
	"resource_type" "project_resources_resource_type" NOT NULL,
	"planned_units" numeric(14, 2) DEFAULT '0' NOT NULL,
	"allocated_units" numeric(14, 2) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_warehouses" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"location_description" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"portfolio_id" varchar(36),
	"program_id" varchar(36),
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"project_type" varchar(120) NOT NULL,
	"lifecycle_stage" "projects_lifecycle_stage" DEFAULT 'planning' NOT NULL,
	"status" "projects_status" DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"contract_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"original_budget" numeric(18, 2) DEFAULT '0' NOT NULL,
	"current_budget" numeric(18, 2) DEFAULT '0' NOT NULL,
	"actual_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"committed_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"forecast_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"planned_start_at" timestamp with time zone,
	"planned_finish_at" timestamp with time zone,
	"forecast_finish_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"contract_id" varchar(36),
	"commitment_id" varchar(36),
	"wbs_item_id" varchar(36),
	"supplier_id" varchar(36),
	"purchase_order_number" varchar(120) NOT NULL,
	"supplier_name" varchar(240) NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"summary" text NOT NULL,
	"status" "purchase_orders_status" DEFAULT 'draft' NOT NULL,
	"received_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_inspections" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"inspection_number" varchar(120) NOT NULL,
	"inspection_type" "quality_inspections_inspection_type" NOT NULL,
	"inspected_at" timestamp with time zone NOT NULL,
	"outcome" "quality_inspections_outcome" NOT NULL,
	"summary" text NOT NULL,
	"status" "quality_inspections_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfis" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"rfi_number" varchar(120) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"question" text NOT NULL,
	"status" "rfis_status" DEFAULT 'draft' NOT NULL,
	"due_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"title" varchar(255) NOT NULL,
	"cause" text,
	"event" text,
	"impact" text,
	"probability" integer NOT NULL,
	"severity" integer NOT NULL,
	"residual_probability" integer,
	"residual_severity" integer,
	"response" text,
	"mitigation" text,
	"trigger" text,
	"owner_membership_id" varchar(36),
	"due_at" timestamp with time zone,
	"status" "risks_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" varchar(36) NOT NULL,
	"permission_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"product_code" "roles_product_code",
	"description" text,
	"system_managed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_structures" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"base_salary" numeric(18, 2) NOT NULL,
	"housing_allowance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"transport_allowance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"hardship_allowance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"gosi_rate" numeric(7, 6) DEFAULT '0' NOT NULL,
	"other_deductions" numeric(18, 2) DEFAULT '0' NOT NULL,
	"eos_monthly_accrual" numeric(18, 2) DEFAULT '0' NOT NULL,
	"eos_accrual_mode" "salary_structures_eos_accrual_mode" DEFAULT 'computed' NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"purpose" "scheduled_jobs_purpose" NOT NULL,
	"schedule_cron_task_uid" varchar(65),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_jobs_schedule_cron_task_uid_unique" UNIQUE("schedule_cron_task_uid")
);
--> statement-breakpoint
CREATE TABLE "self_service_signup_attempts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_daily_report_lines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"line_type" "site_daily_report_lines_line_type" NOT NULL,
	"pmc_activity_definition_id" varchar(36),
	"pmc_unit_id" varchar(36),
	"label" varchar(160),
	"quantity" numeric(10, 2),
	"hours" numeric(6, 2),
	"description" text,
	"reported_status" "pmc_unit_activity_progress_status",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_daily_report_photos" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"file_name" varchar(160) NOT NULL,
	"content_type" varchar(80) NOT NULL,
	"size_bytes" integer NOT NULL,
	"caption" varchar(255),
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_daily_reports" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_date" date NOT NULL,
	"weather" varchar(24),
	"temperature_c" numeric(5, 1),
	"summary" text,
	"obstacles" text,
	"status" "site_daily_reports_status" DEFAULT 'draft' NOT NULL,
	"prepared_by_user_id" integer NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp with time zone,
	"review_note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontract_certificate_lines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"certificate_id" varchar(36) NOT NULL,
	"boq_item_id" varchar(36) NOT NULL,
	"previous_quantity" numeric(18, 3) NOT NULL,
	"current_quantity" numeric(18, 3) NOT NULL,
	"cumulative_quantity" numeric(18, 3) NOT NULL,
	"unit_rate" numeric(18, 2) NOT NULL,
	"current_amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontract_certificates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"subcontract_id" varchar(36) NOT NULL,
	"certificate_number" varchar(80) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gross_amount" numeric(18, 2) NOT NULL,
	"retention_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"advance_recovery_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(18, 2) NOT NULL,
	"status" "subcontract_certificates_status" DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" integer,
	"approved_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontract_contracts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"title" varchar(255) NOT NULL,
	"subcontractor_name" varchar(255) NOT NULL,
	"supplier_id" varchar(36),
	"contract_value" numeric(18, 2) NOT NULL,
	"retention_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"advance_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"status" "subcontract_contracts_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submittal_reply_codes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(8) NOT NULL,
	"label_ar" varchar(120) NOT NULL,
	"label_en" varchar(120) NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"package_code" "subscriptions_package_code" NOT NULL,
	"status" "subscriptions_status" DEFAULT 'trialing' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"legal_name" varchar(240) NOT NULL,
	"contact_name" varchar(160),
	"contact_email" varchar(254),
	"contact_phone" varchar(60),
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"ticket_id" varchar(36) NOT NULL,
	"author_user_id" integer,
	"sender_type" "support_messages_sender_type" NOT NULL,
	"body" text NOT NULL,
	"citations_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"owner_user_id" integer,
	"subject" varchar(255) NOT NULL,
	"category" "support_tickets_category" NOT NULL,
	"priority" "support_tickets_priority" DEFAULT 'normal' NOT NULL,
	"status" "support_tickets_status" DEFAULT 'open' NOT NULL,
	"escalation_status" "support_tickets_escalation_status" DEFAULT 'none' NOT NULL,
	"tags_json" varchar(1000) DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_entitlements" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"subscription_id" varchar(36) NOT NULL,
	"product_code" "tenant_entitlements_product_code" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_license_feature_overrides" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_license_id" varchar(36) NOT NULL,
	"feature_id" varchar(36) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"limit_value" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_licenses" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"subscription_id" varchar(36) NOT NULL,
	"plan_id" varchar(36) NOT NULL,
	"status" "tenant_licenses_status" DEFAULT 'trialing' NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"price_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"manual_activation" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_policies" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"qc_completion_mode" "tenant_policies_mode" DEFAULT 'warn' NOT NULL,
	"qc_accepted_codes" varchar(40) DEFAULT 'A,B' NOT NULL,
	"material_approval_mode" "tenant_policies_mode" DEFAULT 'warn' NOT NULL,
	"updated_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employer_gosi_rate" numeric(7, 6) DEFAULT '0' NOT NULL,
	"employer_gosi_rate_saudi" numeric(7, 6) DEFAULT '0.117500' NOT NULL,
	"employer_gosi_rate_non_saudi" numeric(7, 6) DEFAULT '0.020000' NOT NULL,
	"eos_first_period_years" integer DEFAULT 5 NOT NULL,
	"eos_first_period_months_per_year" numeric(5, 2) DEFAULT '0.50' NOT NULL,
	"eos_later_months_per_year" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"indirect_loading_percent" numeric(7, 4) DEFAULT '0' NOT NULL,
	"hours_per_day" numeric(5, 2) DEFAULT '8' NOT NULL,
	"working_days" varchar(20) DEFAULT '0,1,2,3,4' NOT NULL,
	"updated_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_bid_adjustments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"package_id" varchar(36) NOT NULL,
	"bid_id" varchar(36) NOT NULL,
	"kind" "tender_bid_adjustments_kind" NOT NULL,
	"description" varchar(500) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_bids" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"package_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"duration_days" integer,
	"validity_days" integer,
	"notes" text,
	"status" "tender_bids_status" DEFAULT 'submitted' NOT NULL,
	"status_reason" varchar(500),
	"entered_by_user_id" integer NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_invitees" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"package_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"status" "tender_invitees_status" DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by_user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_packages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"package_code" varchar(120) NOT NULL,
	"title" varchar(255) NOT NULL,
	"scope_summary" text,
	"estimate_amount" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'SAR' NOT NULL,
	"status" "tender_packages_status" DEFAULT 'draft' NOT NULL,
	"closing_at" timestamp with time zone,
	"awarded_bid_id" varchar(36),
	"awarded_contract_id" varchar(36),
	"awarded_commitment_id" varchar(36),
	"awarded_at" timestamp with time zone,
	"awarded_by_user_id" integer,
	"award_justification" text,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"role" "users_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_signed_in" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE TABLE "warehouse_inventory_transactions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"warehouse_id" varchar(36) NOT NULL,
	"material_id" varchar(36) NOT NULL,
	"requisition_id" varchar(36),
	"transfer_id" varchar(36),
	"transaction_type" "warehouse_inventory_transactions_transaction_type" NOT NULL,
	"quantity_delta" numeric(18, 3) NOT NULL,
	"unit_cost" numeric(18, 4),
	"value_delta" numeric(18, 2),
	"reference_number" varchar(120),
	"note" varchar(500),
	"occurred_at" timestamp with time zone NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_inventory_transfers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"source_warehouse_id" varchar(36) NOT NULL,
	"destination_warehouse_id" varchar(36) NOT NULL,
	"destination_project_id" varchar(36),
	"material_id" varchar(36) NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"reference_number" varchar(120),
	"note" varchar(500),
	"transferred_at" timestamp with time zone NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_stocktake_lines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"stocktake_id" varchar(36) NOT NULL,
	"material_id" varchar(36) NOT NULL,
	"system_quantity" numeric(18, 3) NOT NULL,
	"counted_quantity" numeric(18, 3) NOT NULL,
	"variance" numeric(18, 3) NOT NULL,
	"value_delta" numeric(18, 2),
	"inventory_transaction_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_stocktakes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"warehouse_id" varchar(36) NOT NULL,
	"reference" varchar(120),
	"note" varchar(500) NOT NULL,
	"counted_at" timestamp with time zone NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wbs_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"parent_id" varchar(36),
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"planned_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"earned_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"actual_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"progress_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"endpoint_id" varchar(36) NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"payload" text NOT NULL,
	"status" "webhook_deliveries_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status_code" integer,
	"last_error" varchar(300),
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"url" varchar(500) NOT NULL,
	"secret_sealed" text NOT NULL,
	"events" varchar(400) DEFAULT '*' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_owner_membership_id_memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_rate_windows" ADD CONSTRAINT "api_rate_windows_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_rate_windows" ADD CONSTRAINT "api_rate_windows_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_wbs_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_replied_by_user_id_users_id_fk" FOREIGN KEY ("replied_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supplier_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_record_links" ADD CONSTRAINT "control_record_links_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_record_links" ADD CONSTRAINT "control_record_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_record_links" ADD CONSTRAINT "control_record_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_import_errors" ADD CONSTRAINT "data_import_errors_import_id_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."data_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_import_row_results" ADD CONSTRAINT "data_import_row_results_import_id_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."data_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_decision_owner_membership_id_memberships_id_fk" FOREIGN KEY ("decision_owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_comments" ADD CONSTRAINT "design_comments_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_comments" ADD CONSTRAINT "design_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_comments" ADD CONSTRAINT "design_comments_drawing_id_design_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."design_drawings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_comments" ADD CONSTRAINT "design_comments_revision_id_design_drawing_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_drawing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_comments" ADD CONSTRAINT "design_comments_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_comments" ADD CONSTRAINT "design_comments_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_comments" ADD CONSTRAINT "design_comments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawing_revisions" ADD CONSTRAINT "design_drawing_revisions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawing_revisions" ADD CONSTRAINT "design_drawing_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawing_revisions" ADD CONSTRAINT "design_drawing_revisions_drawing_id_design_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."design_drawings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawing_revisions" ADD CONSTRAINT "design_drawing_revisions_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawing_revisions" ADD CONSTRAINT "design_drawing_revisions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_submittals" ADD CONSTRAINT "design_submittals_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_submittals" ADD CONSTRAINT "design_submittals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_submittals" ADD CONSTRAINT "design_submittals_drawing_id_design_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."design_drawings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_submittals" ADD CONSTRAINT "design_submittals_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_submittals" ADD CONSTRAINT "design_submittals_replied_by_user_id_users_id_fk" FOREIGN KEY ("replied_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_submittals" ADD CONSTRAINT "design_submittals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_transmittal_items" ADD CONSTRAINT "design_transmittal_items_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_transmittal_items" ADD CONSTRAINT "design_transmittal_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_transmittal_items" ADD CONSTRAINT "design_trm_items_transmittal_fk" FOREIGN KEY ("transmittal_id") REFERENCES "public"."design_transmittals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_transmittal_items" ADD CONSTRAINT "design_trm_items_revision_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_drawing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_transmittals" ADD CONSTRAINT "design_transmittals_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_transmittals" ADD CONSTRAINT "design_transmittals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_transmittals" ADD CONSTRAINT "design_transmittals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_project_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_preferences" ADD CONSTRAINT "enp_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_preferences" ADD CONSTRAINT "enp_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "eo_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "eo_user_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_resource_fk" FOREIGN KEY ("project_resource_id") REFERENCES "public"."project_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_exclusions" ADD CONSTRAINT "epe_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_exclusions" ADD CONSTRAINT "epe_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_exclusions" ADD CONSTRAINT "epe_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_exclusions" ADD CONSTRAINT "epe_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_objections" ADD CONSTRAINT "epo_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_objections" ADD CONSTRAINT "epo_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_objections" ADD CONSTRAINT "epo_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_objections" ADD CONSTRAINT "epo_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_objections" ADD CONSTRAINT "epo_reviewer_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_time_entries" ADD CONSTRAINT "employee_time_entries_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_time_entries" ADD CONSTRAINT "employee_time_entries_assignment_id_employee_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."employee_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_time_entries" ADD CONSTRAINT "employee_time_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_time_entries" ADD CONSTRAINT "employee_time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_time_entries" ADD CONSTRAINT "employee_time_entries_cost_entry_id_cost_entries_id_fk" FOREIGN KEY ("cost_entry_id") REFERENCES "public"."cost_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_time_entries" ADD CONSTRAINT "employee_time_entries_progress_entry_id_progress_entries_id_fk" FOREIGN KEY ("progress_entry_id") REFERENCES "public"."progress_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_time_entries" ADD CONSTRAINT "employee_time_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_time_entries" ADD CONSTRAINT "employee_time_entries_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_snapshots" ADD CONSTRAINT "evm_snapshots_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_snapshots" ADD CONSTRAINT "evm_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_wbs_snapshots" ADD CONSTRAINT "evm_wbs_snapshots_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_wbs_snapshots" ADD CONSTRAINT "evm_wbs_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_wbs_snapshots" ADD CONSTRAINT "evm_wbs_snapshots_snapshot_id_evm_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."evm_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_wbs_snapshots" ADD CONSTRAINT "evm_wbs_snapshots_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_cost_entry_id_cost_entries_id_fk" FOREIGN KEY ("cost_entry_id") REFERENCES "public"."cost_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "grn_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "grn_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "grn_purchase_order_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "grn_material_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "grn_quality_fk" FOREIGN KEY ("quality_inspection_id") REFERENCES "public"."quality_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "grn_ncr_fk" FOREIGN KEY ("ncr_id") REFERENCES "public"."ncrs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "grn_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hse_observations" ADD CONSTRAINT "hse_observations_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hse_observations" ADD CONSTRAINT "hse_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hse_observations" ADD CONSTRAINT "hse_observations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_inbound_records" ADD CONSTRAINT "integration_inbound_records_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_inbound_records" ADD CONSTRAINT "integration_inbound_records_run_id_integration_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."integration_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_items" ADD CONSTRAINT "integration_sync_items_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_items" ADD CONSTRAINT "integration_sync_items_run_id_integration_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."integration_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notifications" ADD CONSTRAINT "internal_notifications_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notifications" ADD CONSTRAINT "internal_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notifications" ADD CONSTRAINT "internal_notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_owner_membership_id_memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_source_document_id_project_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."project_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_snapshots" ADD CONSTRAINT "master_plan_snapshots_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_snapshots" ADD CONSTRAINT "master_plan_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_snapshots" ADD CONSTRAINT "master_plan_snapshots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_snapshots" ADD CONSTRAINT "mps_plan_version_fk" FOREIGN KEY ("master_plan_version_id") REFERENCES "public"."master_plan_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_spatial_entities" ADD CONSTRAINT "master_plan_spatial_entities_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_spatial_entities" ADD CONSTRAINT "master_plan_spatial_entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_spatial_entities" ADD CONSTRAINT "master_plan_spatial_entities_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_spatial_entities" ADD CONSTRAINT "master_plan_spatial_entities_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_spatial_entities" ADD CONSTRAINT "mp_spatial_entities_version_fk" FOREIGN KEY ("master_plan_version_id") REFERENCES "public"."master_plan_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_versions" ADD CONSTRAINT "master_plan_versions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_versions" ADD CONSTRAINT "master_plan_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_versions" ADD CONSTRAINT "master_plan_versions_master_plan_id_master_plans_id_fk" FOREIGN KEY ("master_plan_id") REFERENCES "public"."master_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_versions" ADD CONSTRAINT "master_plan_versions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_visualization_rules" ADD CONSTRAINT "mpvr_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_visualization_rules" ADD CONSTRAINT "mpvr_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plan_visualization_rules" ADD CONSTRAINT "mpvr_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plans" ADD CONSTRAINT "master_plans_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plans" ADD CONSTRAINT "master_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_plans" ADD CONSTRAINT "master_plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issues" ADD CONSTRAINT "mi_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issues" ADD CONSTRAINT "mi_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issues" ADD CONSTRAINT "mi_tx_fk" FOREIGN KEY ("inventory_transaction_id") REFERENCES "public"."warehouse_inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issues" ADD CONSTRAINT "mi_cost_fk" FOREIGN KEY ("cost_entry_id") REFERENCES "public"."cost_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issues" ADD CONSTRAINT "mi_material_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issues" ADD CONSTRAINT "mi_wbs_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issues" ADD CONSTRAINT "mi_activity_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issues" ADD CONSTRAINT "mi_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_masters" ADD CONSTRAINT "material_masters_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_masters" ADD CONSTRAINT "material_masters_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_material_issue_id_material_issues_id_fk" FOREIGN KEY ("material_issue_id") REFERENCES "public"."material_issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_cost_entry_id_cost_entries_id_fk" FOREIGN KEY ("cost_entry_id") REFERENCES "public"."cost_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_tx_fk" FOREIGN KEY ("inventory_transaction_id") REFERENCES "public"."warehouse_inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allocation_adjustments" ADD CONSTRAINT "paa_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allocation_adjustments" ADD CONSTRAINT "paa_allocation_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."payroll_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allocation_adjustments" ADD CONSTRAINT "paa_user_fk" FOREIGN KEY ("adjusted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allocations" ADD CONSTRAINT "payroll_allocations_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allocations" ADD CONSTRAINT "payroll_allocations_payroll_entry_id_payroll_entries_id_fk" FOREIGN KEY ("payroll_entry_id") REFERENCES "public"."payroll_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allocations" ADD CONSTRAINT "payroll_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allocations" ADD CONSTRAINT "payroll_allocations_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allocations" ADD CONSTRAINT "payroll_allocations_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allocations" ADD CONSTRAINT "payroll_allocations_cost_entry_id_cost_entries_id_fk" FOREIGN KEY ("cost_entry_id") REFERENCES "public"."cost_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_salary_structure_id_salary_structures_id_fk" FOREIGN KEY ("salary_structure_id") REFERENCES "public"."salary_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_feature_entitlements" ADD CONSTRAINT "plan_feature_entitlements_plan_id_commercial_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commercial_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_feature_entitlements" ADD CONSTRAINT "plan_feature_entitlements_feature_id_commercial_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."commercial_features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_definitions" ADD CONSTRAINT "pmc_activity_definitions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_definitions" ADD CONSTRAINT "pmc_activity_definitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_definitions" ADD CONSTRAINT "pmc_activity_definitions_group_id_pmc_activity_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."pmc_activity_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_definitions" ADD CONSTRAINT "pmc_activity_definitions_stage_id_pmc_activity_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pmc_activity_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_definitions" ADD CONSTRAINT "pmc_activity_definitions_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_groups" ADD CONSTRAINT "pmc_activity_groups_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_groups" ADD CONSTRAINT "pmc_activity_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_stages" ADD CONSTRAINT "pmc_activity_stages_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_stages" ADD CONSTRAINT "pmc_activity_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_activity_stages" ADD CONSTRAINT "pmc_activity_stages_group_id_pmc_activity_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."pmc_activity_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_baselines" ADD CONSTRAINT "pmc_baselines_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_baselines" ADD CONSTRAINT "pmc_baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_baselines" ADD CONSTRAINT "pmc_base_activity_fk" FOREIGN KEY ("activity_definition_id") REFERENCES "public"."pmc_activity_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_blocks" ADD CONSTRAINT "pmc_blocks_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_blocks" ADD CONSTRAINT "pmc_blocks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_blocks" ADD CONSTRAINT "pmc_blocks_zone_id_pmc_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."pmc_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_request_units" ADD CONSTRAINT "pmc_inspection_request_units_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_request_units" ADD CONSTRAINT "pmc_inspection_request_units_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_request_units" ADD CONSTRAINT "pmc_inspection_unit_request_fk" FOREIGN KEY ("inspection_request_id") REFERENCES "public"."pmc_inspection_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_request_units" ADD CONSTRAINT "pmc_inspection_unit_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."pmc_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_requests" ADD CONSTRAINT "pmc_inspection_requests_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_requests" ADD CONSTRAINT "pmc_inspection_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_requests" ADD CONSTRAINT "pmc_insp_activity_fk" FOREIGN KEY ("activity_definition_id") REFERENCES "public"."pmc_activity_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_steps" ADD CONSTRAINT "pmc_inspection_steps_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_steps" ADD CONSTRAINT "pmc_inspection_steps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_inspection_steps" ADD CONSTRAINT "pmc_step_request_fk" FOREIGN KEY ("inspection_request_id") REFERENCES "public"."pmc_inspection_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_site_plans" ADD CONSTRAINT "pmc_site_plans_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_site_plans" ADD CONSTRAINT "pmc_site_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_site_plans" ADD CONSTRAINT "pmc_site_plans_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_status_factors" ADD CONSTRAINT "pmc_status_factors_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_status_factors" ADD CONSTRAINT "pmc_status_factors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_status_factors" ADD CONSTRAINT "pmc_status_factors_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_history" ADD CONSTRAINT "pmc_unit_activity_history_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_history" ADD CONSTRAINT "pmc_unit_activity_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_history" ADD CONSTRAINT "pmc_unit_activity_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_history" ADD CONSTRAINT "pmc_hist_progress_fk" FOREIGN KEY ("unit_activity_progress_id") REFERENCES "public"."pmc_unit_activity_progress"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_progress" ADD CONSTRAINT "pmc_unit_activity_progress_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_progress" ADD CONSTRAINT "pmc_unit_activity_progress_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_progress" ADD CONSTRAINT "pmc_unit_activity_progress_unit_id_pmc_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."pmc_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_progress" ADD CONSTRAINT "pmc_unit_activity_progress_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_progress" ADD CONSTRAINT "pmc_unit_activity_progress_last_changed_by_user_id_users_id_fk" FOREIGN KEY ("last_changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_progress" ADD CONSTRAINT "pmc_progress_activity_fk" FOREIGN KEY ("activity_definition_id") REFERENCES "public"."pmc_activity_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_unit_activity_progress" ADD CONSTRAINT "pmc_progress_verification_fk" FOREIGN KEY ("verification_status_id") REFERENCES "public"."pmc_verification_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_units" ADD CONSTRAINT "pmc_units_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_units" ADD CONSTRAINT "pmc_units_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_units" ADD CONSTRAINT "pmc_units_block_id_pmc_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."pmc_blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_verification_statuses" ADD CONSTRAINT "pmc_verification_statuses_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_verification_statuses" ADD CONSTRAINT "pmc_verification_statuses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_zones" ADD CONSTRAINT "pmc_zones_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmc_zones" ADD CONSTRAINT "pmc_zones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_supplier_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_material_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_wbs_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_activity_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_purchase_order_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_po_linker_fk" FOREIGN KEY ("purchase_order_linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_invoices" ADD CONSTRAINT "proinv_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_invoices" ADD CONSTRAINT "proinv_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_invoices" ADD CONSTRAINT "proinv_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_health_snapshots" ADD CONSTRAINT "project_health_snapshots_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_health_snapshots" ADD CONSTRAINT "project_health_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_overrides" ADD CONSTRAINT "project_material_overrides_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_overrides" ADD CONSTRAINT "project_material_overrides_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_overrides" ADD CONSTRAINT "project_material_overrides_material_id_material_masters_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_overrides" ADD CONSTRAINT "project_material_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_warehouses" ADD CONSTRAINT "pwh_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_warehouses" ADD CONSTRAINT "pwh_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_warehouses" ADD CONSTRAINT "pwh_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_wbs_item_id_wbs_items_id_fk" FOREIGN KEY ("wbs_item_id") REFERENCES "public"."wbs_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_owner_membership_id_memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_service_signup_attempts" ADD CONSTRAINT "self_service_signup_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_report_lines" ADD CONSTRAINT "site_daily_report_lines_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_report_lines" ADD CONSTRAINT "site_daily_report_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_report_lines" ADD CONSTRAINT "site_daily_report_lines_report_id_site_daily_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."site_daily_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_report_id_site_daily_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."site_daily_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_prepared_by_user_id_users_id_fk" FOREIGN KEY ("prepared_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_certificate_lines" ADD CONSTRAINT "subline_cert_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."subcontract_certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_certificate_lines" ADD CONSTRAINT "subline_boq_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_certificates" ADD CONSTRAINT "subcert_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_certificates" ADD CONSTRAINT "subcert_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_certificates" ADD CONSTRAINT "subcert_contract_fk" FOREIGN KEY ("subcontract_id") REFERENCES "public"."subcontract_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_certificates" ADD CONSTRAINT "subcert_approver_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_certificates" ADD CONSTRAINT "subcert_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_contracts" ADD CONSTRAINT "subcon_supplier_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_contracts" ADD CONSTRAINT "subcon_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_contracts" ADD CONSTRAINT "subcon_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_contracts" ADD CONSTRAINT "subcon_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submittal_reply_codes" ADD CONSTRAINT "submittal_reply_codes_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "sup_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "sup_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_license_feature_overrides" ADD CONSTRAINT "tl_feature_overrides_feature_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."commercial_features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_license_feature_overrides" ADD CONSTRAINT "tl_feature_overrides_license_fk" FOREIGN KEY ("tenant_license_id") REFERENCES "public"."tenant_licenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_licenses" ADD CONSTRAINT "tenant_licenses_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_licenses" ADD CONSTRAINT "tenant_licenses_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_licenses" ADD CONSTRAINT "tenant_licenses_plan_id_commercial_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commercial_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_licenses" ADD CONSTRAINT "tenant_licenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_policies" ADD CONSTRAINT "tenant_policies_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_policies" ADD CONSTRAINT "tenant_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bid_adjustments" ADD CONSTRAINT "tender_bid_adjustments_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bid_adjustments" ADD CONSTRAINT "tender_bid_adjustments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bid_adjustments" ADD CONSTRAINT "tender_bid_adjustments_package_id_tender_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."tender_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bid_adjustments" ADD CONSTRAINT "tender_bid_adjustments_bid_id_tender_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."tender_bids"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bid_adjustments" ADD CONSTRAINT "tender_bid_adjustments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bids" ADD CONSTRAINT "tender_bids_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bids" ADD CONSTRAINT "tender_bids_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bids" ADD CONSTRAINT "tender_bids_package_id_tender_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."tender_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bids" ADD CONSTRAINT "tender_bids_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_bids" ADD CONSTRAINT "tender_bids_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_invitees" ADD CONSTRAINT "tender_invitees_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_invitees" ADD CONSTRAINT "tender_invitees_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_invitees" ADD CONSTRAINT "tender_invitees_package_id_tender_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."tender_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_invitees" ADD CONSTRAINT "tender_invitees_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_invitees" ADD CONSTRAINT "tender_invitees_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_packages" ADD CONSTRAINT "tender_packages_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_packages" ADD CONSTRAINT "tender_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_packages" ADD CONSTRAINT "tender_packages_awarded_by_user_id_users_id_fk" FOREIGN KEY ("awarded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_packages" ADD CONSTRAINT "tender_packages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transactions" ADD CONSTRAINT "wit_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transactions" ADD CONSTRAINT "wit_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transactions" ADD CONSTRAINT "wit_warehouse_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."project_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transactions" ADD CONSTRAINT "wit_material_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transactions" ADD CONSTRAINT "wit_requisition_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."procurement_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transactions" ADD CONSTRAINT "wit_transfer_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."warehouse_inventory_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transactions" ADD CONSTRAINT "wit_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transfers" ADD CONSTRAINT "witf_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transfers" ADD CONSTRAINT "witf_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transfers" ADD CONSTRAINT "witf_source_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."project_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transfers" ADD CONSTRAINT "witf_destination_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."project_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transfers" ADD CONSTRAINT "witf_material_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transfers" ADD CONSTRAINT "witf_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "warehouse_stocktake_lines_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "warehouse_stocktake_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "warehouse_stocktake_lines_material_id_material_masters_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "wh_stocktake_lines_stocktake_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."warehouse_stocktakes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "wh_stocktake_lines_tx_fk" FOREIGN KEY ("inventory_transaction_id") REFERENCES "public"."warehouse_inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_warehouse_id_project_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."project_warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wbs_items" ADD CONSTRAINT "wbs_items_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wbs_items" ADD CONSTRAINT "wbs_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_tenant_project_due_idx" ON "actions" USING btree ("tenant_id","project_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_project_code_unique" ON "activities" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "activities_tenant_project_idx" ON "activities" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_prefix_unique" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_entity_idx" ON "audit_logs" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "boq_project_code_unique" ON "boq_items" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "boq_tenant_project_idx" ON "boq_items" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "budget_lines_tenant_project_idx" ON "budget_lines" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "change_requests_project_number_unique" ON "change_requests" USING btree ("project_id","change_number");--> statement-breakpoint
CREATE INDEX "change_requests_tenant_project_status_idx" ON "change_requests" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_project_number_unique" ON "claims" USING btree ("project_id","claim_number");--> statement-breakpoint
CREATE INDEX "claims_tenant_project_status_idx" ON "claims" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE INDEX "claims_contract_idx" ON "claims" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "client_requests_tenant_created_idx" ON "client_requests" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_features_code_unique" ON "commercial_features" USING btree ("code");--> statement-breakpoint
CREATE INDEX "commercial_features_product_active_idx" ON "commercial_features" USING btree ("product_code","active");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_plans_code_unique" ON "commercial_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "commercial_plans_package_active_idx" ON "commercial_plans" USING btree ("package_code","active");--> statement-breakpoint
CREATE UNIQUE INDEX "commitments_project_code_unique" ON "commitments" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "commitments_tenant_project_status_idx" ON "commitments" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE INDEX "commitments_contract_idx" ON "commitments" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_unique" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "consultant_submittals_number_revision_unique" ON "consultant_submittals" USING btree ("project_id","submittal_number","revision");--> statement-breakpoint
CREATE INDEX "consultant_submittals_tenant_project_status_idx" ON "consultant_submittals" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE INDEX "consultant_submittals_material_idx" ON "consultant_submittals" USING btree ("project_id","material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_project_code_unique" ON "contracts" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "contracts_tenant_project_status_idx" ON "contracts" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE INDEX "contracts_supplier_idx" ON "contracts" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "control_record_links_project_source_target_unique" ON "control_record_links" USING btree ("project_id","source_type","source_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "control_record_links_tenant_project_source_idx" ON "control_record_links" USING btree ("tenant_id","project_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "control_record_links_tenant_project_target_idx" ON "control_record_links" USING btree ("tenant_id","project_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "cost_entries_tenant_project_date_idx" ON "cost_entries" USING btree ("tenant_id","project_id","incurred_at");--> statement-breakpoint
CREATE INDEX "data_import_errors_import_row_idx" ON "data_import_errors" USING btree ("import_id","row_number");--> statement-breakpoint
CREATE INDEX "data_import_row_results_import_row_idx" ON "data_import_row_results" USING btree ("import_id","row_number");--> statement-breakpoint
CREATE UNIQUE INDEX "data_import_row_results_import_row_action_unique" ON "data_import_row_results" USING btree ("import_id","row_number","action");--> statement-breakpoint
CREATE INDEX "data_imports_tenant_project_status_idx" ON "data_imports" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "data_imports_tenant_file_hash_unique" ON "data_imports" USING btree ("tenant_id","file_hash") WHERE "data_imports"."status" <> 'failed';--> statement-breakpoint
CREATE INDEX "decisions_tenant_project_status_idx" ON "decisions" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "design_comments_project_number_unique" ON "design_comments" USING btree ("project_id","comment_number");--> statement-breakpoint
CREATE INDEX "design_comments_tenant_project_status_idx" ON "design_comments" USING btree ("tenant_id","project_id","status","due_at");--> statement-breakpoint
CREATE INDEX "design_comments_drawing_idx" ON "design_comments" USING btree ("drawing_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "design_revisions_drawing_revision_unique" ON "design_drawing_revisions" USING btree ("drawing_id","revision");--> statement-breakpoint
CREATE INDEX "design_revisions_tenant_project_idx" ON "design_drawing_revisions" USING btree ("tenant_id","project_id","drawing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_drawings_project_number_unique" ON "design_drawings" USING btree ("project_id","drawing_number");--> statement-breakpoint
CREATE INDEX "design_drawings_tenant_project_status_idx" ON "design_drawings" USING btree ("tenant_id","project_id","status","discipline");--> statement-breakpoint
CREATE UNIQUE INDEX "design_submittals_project_number_unique" ON "design_submittals" USING btree ("project_id","submittal_number");--> statement-breakpoint
CREATE INDEX "design_submittals_tenant_project_status_idx" ON "design_submittals" USING btree ("tenant_id","project_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "design_transmittal_items_unique" ON "design_transmittal_items" USING btree ("transmittal_id","revision_id");--> statement-breakpoint
CREATE INDEX "design_transmittal_items_revision_idx" ON "design_transmittal_items" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_transmittals_project_number_unique" ON "design_transmittals" USING btree ("project_id","transmittal_number");--> statement-breakpoint
CREATE INDEX "design_transmittals_tenant_project_status_idx" ON "design_transmittals" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_version_unique" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "document_versions_tenant_project_document_idx" ON "document_versions" USING btree ("tenant_id","project_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_preferences_unique" ON "email_notification_preferences" USING btree ("tenant_id","user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_dedupe_unique" ON "email_outbox" USING btree ("tenant_id","recipient_user_id","kind","dedupe_key");--> statement-breakpoint
CREATE INDEX "email_outbox_status_created_idx" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "employee_assignments_tenant_project_idx" ON "employee_assignments" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE INDEX "employee_assignments_employee_window_idx" ON "employee_assignments" USING btree ("tenant_id","employee_id","planned_start_at","planned_finish_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_attendance_tenant_day_unique" ON "employee_attendance" USING btree ("tenant_id","employee_id","attendance_date");--> statement-breakpoint
CREATE INDEX "employee_attendance_tenant_status_idx" ON "employee_attendance" USING btree ("tenant_id","status","attendance_date");--> statement-breakpoint
CREATE UNIQUE INDEX "epe_source_unique" ON "employee_performance_exclusions" USING btree ("tenant_id","employee_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "epe_tenant_project_employee_idx" ON "employee_performance_exclusions" USING btree ("tenant_id","project_id","employee_id");--> statement-breakpoint
CREATE INDEX "epo_tenant_project_employee_idx" ON "employee_performance_objections" USING btree ("tenant_id","project_id","employee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_time_entries_assignment_day_unique" ON "employee_time_entries" USING btree ("assignment_id","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_time_entries_cost_entry_unique" ON "employee_time_entries" USING btree ("cost_entry_id");--> statement-breakpoint
CREATE INDEX "employee_time_entries_tenant_project_idx" ON "employee_time_entries" USING btree ("tenant_id","project_id","status","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_number_unique" ON "employees" USING btree ("tenant_id","employee_number");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_user_unique" ON "employees" USING btree ("tenant_id","linked_user_id");--> statement-breakpoint
CREATE INDEX "employees_tenant_status_idx" ON "employees" USING btree ("tenant_id","employment_status");--> statement-breakpoint
CREATE INDEX "employment_contracts_tenant_employee_idx" ON "employment_contracts" USING btree ("tenant_id","employee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "evm_snapshots_project_period_unique" ON "evm_snapshots" USING btree ("project_id","period_at");--> statement-breakpoint
CREATE INDEX "evm_snapshots_tenant_project_idx" ON "evm_snapshots" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evm_wbs_snapshots_unique" ON "evm_wbs_snapshots" USING btree ("snapshot_id","wbs_item_id");--> statement-breakpoint
CREATE INDEX "evm_wbs_snapshots_project_idx" ON "evm_wbs_snapshots" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_reports_project_number_unique" ON "field_reports" USING btree ("project_id","report_number");--> statement-breakpoint
CREATE INDEX "field_reports_tenant_project_date_status_idx" ON "field_reports" USING btree ("tenant_id","project_id","reported_at","status");--> statement-breakpoint
CREATE UNIQUE INDEX "grn_project_number_unique" ON "goods_receipt_notes" USING btree ("project_id","grn_number");--> statement-breakpoint
CREATE INDEX "grn_tenant_project_date_idx" ON "goods_receipt_notes" USING btree ("tenant_id","project_id","received_at");--> statement-breakpoint
CREATE INDEX "grn_purchase_order_idx" ON "goods_receipt_notes" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "grn_material_idx" ON "goods_receipt_notes" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grn_cost_entry_unique" ON "goods_receipt_notes" USING btree ("cost_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grn_inventory_transaction_unique" ON "goods_receipt_notes" USING btree ("inventory_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hse_observations_project_number_unique" ON "hse_observations" USING btree ("project_id","observation_number");--> statement-breakpoint
CREATE INDEX "hse_observations_tenant_project_status_due_idx" ON "hse_observations" USING btree ("tenant_id","project_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_tenant_system_name_unique" ON "integration_connections" USING btree ("tenant_id","system","name");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_inbound_records_unique" ON "integration_inbound_records" USING btree ("tenant_id","system","entity_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_mappings_unique" ON "integration_mappings" USING btree ("tenant_id","system","entity_type","external_id");--> statement-breakpoint
CREATE INDEX "integration_mappings_internal_idx" ON "integration_mappings" USING btree ("tenant_id","entity_type","internal_id");--> statement-breakpoint
CREATE INDEX "integration_sync_items_run_idx" ON "integration_sync_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "integration_sync_items_tenant_outcome_idx" ON "integration_sync_items" USING btree ("tenant_id","outcome");--> statement-breakpoint
CREATE INDEX "integration_sync_runs_tenant_idx" ON "integration_sync_runs" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE INDEX "internal_notifications_recipient_tenant_ack_idx" ON "internal_notifications" USING btree ("recipient_user_id","tenant_id","acknowledged_at");--> statement-breakpoint
CREATE INDEX "internal_notifications_tenant_project_idx" ON "internal_notifications" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_sequence_unique" ON "invoices" USING btree ("sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_number_unique" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "inv_tenant_issued_idx" ON "invoices" USING btree ("tenant_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_project_code_unique" ON "issues" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "issues_tenant_project_status_idx" ON "issues" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "kba_document_unique" ON "knowledge_articles" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "kba_tenant_status_idx" ON "knowledge_articles" USING btree ("tenant_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "master_plan_snapshots_tenant_project_version_creator_idx" ON "master_plan_snapshots" USING btree ("tenant_id","project_id","master_plan_version_id","created_by_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "master_plan_spatial_entities_version_code_unique" ON "master_plan_spatial_entities" USING btree ("master_plan_version_id","code");--> statement-breakpoint
CREATE INDEX "master_plan_spatial_entities_tenant_project_version_idx" ON "master_plan_spatial_entities" USING btree ("tenant_id","project_id","master_plan_version_id");--> statement-breakpoint
CREATE INDEX "master_plan_spatial_entities_version_status_idx" ON "master_plan_spatial_entities" USING btree ("master_plan_version_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "master_plan_versions_plan_version_unique" ON "master_plan_versions" USING btree ("master_plan_id","version_number");--> statement-breakpoint
CREATE INDEX "master_plan_versions_tenant_project_plan_idx" ON "master_plan_versions" USING btree ("tenant_id","project_id","master_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "master_plan_visualization_rules_project_metric_unique" ON "master_plan_visualization_rules" USING btree ("tenant_id","project_id","metric");--> statement-breakpoint
CREATE INDEX "master_plan_visualization_rules_tenant_project_idx" ON "master_plan_visualization_rules" USING btree ("tenant_id","project_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "master_plans_project_code_unique" ON "master_plans" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "master_plans_tenant_project_status_idx" ON "master_plans" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "material_issues_tx_unique" ON "material_issues" USING btree ("inventory_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_issues_cost_unique" ON "material_issues" USING btree ("cost_entry_id");--> statement-breakpoint
CREATE INDEX "material_issues_tenant_project_idx" ON "material_issues" USING btree ("tenant_id","project_id","issued_at");--> statement-breakpoint
CREATE INDEX "material_issues_wbs_activity_idx" ON "material_issues" USING btree ("wbs_item_id","activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_masters_tenant_code_unique" ON "material_masters" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "material_masters_tenant_category_active_idx" ON "material_masters" USING btree ("tenant_id","category","active");--> statement-breakpoint
CREATE UNIQUE INDEX "material_returns_tx_unique" ON "material_returns" USING btree ("inventory_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_returns_cost_unique" ON "material_returns" USING btree ("cost_entry_id");--> statement-breakpoint
CREATE INDEX "material_returns_issue_idx" ON "material_returns" USING btree ("material_issue_id");--> statement-breakpoint
CREATE INDEX "material_returns_tenant_project_idx" ON "material_returns" USING btree ("tenant_id","project_id","returned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_invitations_token_hash_unique" ON "membership_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "membership_invitations_tenant_email_status_idx" ON "membership_invitations" USING btree ("tenant_id","email","status");--> statement-breakpoint
CREATE INDEX "membership_invitations_email_status_idx" ON "membership_invitations" USING btree ("email","status");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_roles_scope_unique" ON "membership_roles" USING btree ("membership_id","role_id","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "membership_roles_membership_idx" ON "membership_roles" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_user_unique" ON "memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_tenant_idx" ON "memberships" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ncrs_project_number_unique" ON "ncrs" USING btree ("project_id","ncr_number");--> statement-breakpoint
CREATE INDEX "ncrs_tenant_project_status_due_idx" ON "ncrs" USING btree ("tenant_id","project_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_provider_ref_unique" ON "payment_records" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "pay_tenant_sub_idx" ON "payment_records" USING btree ("tenant_id","subscription_id");--> statement-breakpoint
CREATE INDEX "payroll_allocation_adjustments_allocation_idx" ON "payroll_allocation_adjustments" USING btree ("allocation_id","created_at");--> statement-breakpoint
CREATE INDEX "payroll_allocation_adjustments_tenant_idx" ON "payroll_allocation_adjustments" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "payroll_allocations_tenant_project_idx" ON "payroll_allocations" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_allocations_cost_entry_unique" ON "payroll_allocations" USING btree ("cost_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_entries_run_employee_unique" ON "payroll_entries" USING btree ("payroll_run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_entries_tenant_run_idx" ON "payroll_entries" USING btree ("tenant_id","payroll_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_tenant_period_unique" ON "payroll_runs" USING btree ("tenant_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "payroll_runs_tenant_status_idx" ON "payroll_runs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_unique" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_feature_entitlements_plan_feature_unique" ON "plan_feature_entitlements" USING btree ("plan_id","feature_id");--> statement-breakpoint
CREATE INDEX "plan_feature_entitlements_feature_idx" ON "plan_feature_entitlements" USING btree ("feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_activity_defs_model_code_unique" ON "pmc_activity_definitions" USING btree ("project_id","model_code","code");--> statement-breakpoint
CREATE INDEX "pmc_activity_defs_tenant_project_model_idx" ON "pmc_activity_definitions" USING btree ("tenant_id","project_id","model_code");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_groups_project_code_unique" ON "pmc_activity_groups" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "pmc_groups_tenant_project_idx" ON "pmc_activity_groups" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_stages_project_code_unique" ON "pmc_activity_stages" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "pmc_stages_tenant_project_group_idx" ON "pmc_activity_stages" USING btree ("tenant_id","project_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_baseline_activity_period_unique" ON "pmc_baselines" USING btree ("activity_definition_id","period_at");--> statement-breakpoint
CREATE INDEX "pmc_baselines_tenant_project_period_idx" ON "pmc_baselines" USING btree ("tenant_id","project_id","period_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_blocks_project_code_unique" ON "pmc_blocks" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "pmc_blocks_tenant_project_zone_idx" ON "pmc_blocks" USING btree ("tenant_id","project_id","zone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_inspection_unit_unique" ON "pmc_inspection_request_units" USING btree ("inspection_request_id","unit_id");--> statement-breakpoint
CREATE INDEX "pmc_inspection_units_tenant_project_idx" ON "pmc_inspection_request_units" USING btree ("tenant_id","project_id","unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_inspections_project_code_unique" ON "pmc_inspection_requests" USING btree ("project_id","request_code");--> statement-breakpoint
CREATE INDEX "pmc_inspections_tenant_project_activity_idx" ON "pmc_inspection_requests" USING btree ("tenant_id","project_id","activity_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_inspection_step_unique" ON "pmc_inspection_steps" USING btree ("inspection_request_id","step_code");--> statement-breakpoint
CREATE INDEX "pmc_inspection_steps_tenant_project_status_idx" ON "pmc_inspection_steps" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE INDEX "pmc_site_plans_tenant_project_idx" ON "pmc_site_plans" USING btree ("tenant_id","project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_status_factor_unique" ON "pmc_status_factors" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "pmc_status_factors_tenant_project_idx" ON "pmc_status_factors" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "pmc_history_tenant_project_changed_idx" ON "pmc_unit_activity_history" USING btree ("tenant_id","project_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_unit_activity_unique" ON "pmc_unit_activity_progress" USING btree ("unit_id","activity_definition_id");--> statement-breakpoint
CREATE INDEX "pmc_unit_progress_tenant_project_status_idx" ON "pmc_unit_activity_progress" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_units_project_number_unique" ON "pmc_units" USING btree ("project_id","unit_number");--> statement-breakpoint
CREATE INDEX "pmc_units_tenant_project_block_idx" ON "pmc_units" USING btree ("tenant_id","project_id","block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_verification_status_project_code_unique" ON "pmc_verification_statuses" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "pmc_verification_status_tenant_project_idx" ON "pmc_verification_statuses" USING btree ("tenant_id","project_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "pmc_zones_project_code_unique" ON "pmc_zones" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "pmc_zones_tenant_project_idx" ON "pmc_zones" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_tenant_code_unique" ON "portfolios" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_requisitions_project_number_unique" ON "procurement_requisitions" USING btree ("project_id","requisition_number");--> statement-breakpoint
CREATE INDEX "procurement_requisitions_tenant_project_status_idx" ON "procurement_requisitions" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE INDEX "procurement_requisitions_purchase_order_idx" ON "procurement_requisitions" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_tenant_code_unique" ON "programs" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "programs_tenant_portfolio_idx" ON "programs" USING btree ("tenant_id","portfolio_id");--> statement-breakpoint
CREATE INDEX "progress_entries_tenant_project_date_idx" ON "progress_entries" USING btree ("tenant_id","project_id","measured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "proj_inv_project_number_unique" ON "project_commercial_invoices" USING btree ("project_id","invoice_number");--> statement-breakpoint
CREATE INDEX "proj_inv_tenant_project_idx" ON "project_commercial_invoices" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_documents_project_number_unique" ON "project_documents" USING btree ("project_id","document_number");--> statement-breakpoint
CREATE INDEX "project_documents_tenant_project_status_idx" ON "project_documents" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_health_period_unique" ON "project_health_snapshots" USING btree ("project_id","period_at");--> statement-breakpoint
CREATE INDEX "project_health_tenant_project_idx" ON "project_health_snapshots" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_material_overrides_project_material_unique" ON "project_material_overrides" USING btree ("project_id","material_id");--> statement-breakpoint
CREATE INDEX "project_material_overrides_tenant_project_idx" ON "project_material_overrides" USING btree ("tenant_id","project_id","material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_resources_project_code_unique" ON "project_resources" USING btree ("project_id","resource_code");--> statement-breakpoint
CREATE INDEX "project_resources_tenant_project_type_idx" ON "project_resources" USING btree ("tenant_id","project_id","resource_type");--> statement-breakpoint
CREATE UNIQUE INDEX "project_warehouses_project_code_unique" ON "project_warehouses" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "project_warehouses_tenant_project_active_idx" ON "project_warehouses" USING btree ("tenant_id","project_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_tenant_code_unique" ON "projects" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "projects_tenant_portfolio_idx" ON "projects" USING btree ("tenant_id","portfolio_id");--> statement-breakpoint
CREATE INDEX "projects_tenant_program_idx" ON "projects" USING btree ("tenant_id","program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_project_number_unique" ON "purchase_orders" USING btree ("project_id","purchase_order_number");--> statement-breakpoint
CREATE INDEX "purchase_orders_tenant_project_date_status_idx" ON "purchase_orders" USING btree ("tenant_id","project_id","order_date","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_contract_idx" ON "purchase_orders" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_commitment_idx" ON "purchase_orders" USING btree ("commitment_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_wbs_idx" ON "purchase_orders" USING btree ("wbs_item_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_inspections_project_number_unique" ON "quality_inspections" USING btree ("project_id","inspection_number");--> statement-breakpoint
CREATE INDEX "quality_inspections_tenant_project_date_status_idx" ON "quality_inspections" USING btree ("tenant_id","project_id","inspected_at","status");--> statement-breakpoint
CREATE UNIQUE INDEX "rfis_project_number_unique" ON "rfis" USING btree ("project_id","rfi_number");--> statement-breakpoint
CREATE INDEX "rfis_tenant_project_status_due_idx" ON "rfis" USING btree ("tenant_id","project_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "risks_project_code_unique" ON "risks" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "risks_tenant_project_status_idx" ON "risks" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_tenant_code_unique" ON "roles" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_structures_tenant_employee_unique" ON "salary_structures" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "salary_structures_tenant_active_idx" ON "salary_structures" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_task_uid_idx" ON "scheduled_jobs" USING btree ("schedule_cron_task_uid");--> statement-breakpoint
CREATE INDEX "ssa_user_created_idx" ON "self_service_signup_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ssa_email_created_idx" ON "self_service_signup_attempts" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE INDEX "site_daily_report_lines_report_idx" ON "site_daily_report_lines" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "site_daily_report_lines_cell_idx" ON "site_daily_report_lines" USING btree ("pmc_unit_id","pmc_activity_definition_id");--> statement-breakpoint
CREATE INDEX "site_daily_report_photos_report_idx" ON "site_daily_report_photos" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_daily_report_photos_key_unique" ON "site_daily_report_photos" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "site_daily_reports_project_date_preparer_unique" ON "site_daily_reports" USING btree ("project_id","report_date","prepared_by_user_id");--> statement-breakpoint
CREATE INDEX "site_daily_reports_tenant_project_status_idx" ON "site_daily_reports" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subcert_line_unique" ON "subcontract_certificate_lines" USING btree ("certificate_id","boq_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subcert_project_number_unique" ON "subcontract_certificates" USING btree ("project_id","certificate_number");--> statement-breakpoint
CREATE INDEX "subcert_tenant_project_idx" ON "subcontract_certificates" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subcontract_project_code_unique" ON "subcontract_contracts" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "subcontract_tenant_project_idx" ON "subcontract_contracts" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "subcontract_supplier_idx" ON "subcontract_contracts" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submittal_reply_codes_tenant_code_unique" ON "submittal_reply_codes" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_status_idx" ON "subscriptions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_tenant_code_unique" ON "suppliers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_active_idx" ON "suppliers" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "spm_ticket_created_idx" ON "support_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "spm_tenant_created_idx" ON "support_messages" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "spt_tenant_status_idx" ON "support_tickets" USING btree ("tenant_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "spt_owner_status_idx" ON "support_tickets" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_entitlements_subscription_product_unique" ON "tenant_entitlements" USING btree ("subscription_id","product_code");--> statement-breakpoint
CREATE INDEX "tenant_entitlements_tenant_product_idx" ON "tenant_entitlements" USING btree ("tenant_id","product_code","active");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_license_feature_overrides_license_feature_unique" ON "tenant_license_feature_overrides" USING btree ("tenant_license_id","feature_id");--> statement-breakpoint
CREATE INDEX "tenant_license_feature_overrides_feature_idx" ON "tenant_license_feature_overrides" USING btree ("feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_licenses_subscription_unique" ON "tenant_licenses" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "tenant_licenses_tenant_status_idx" ON "tenant_licenses" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "tenant_licenses_plan_idx" ON "tenant_licenses" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_policies_tenant_unique" ON "tenant_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_settings_tenant_unique" ON "tenant_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tender_adjustments_bid_idx" ON "tender_bid_adjustments" USING btree ("bid_id");--> statement-breakpoint
CREATE INDEX "tender_adjustments_package_idx" ON "tender_bid_adjustments" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_bids_package_supplier_unique" ON "tender_bids" USING btree ("package_id","supplier_id");--> statement-breakpoint
CREATE INDEX "tender_bids_package_status_idx" ON "tender_bids" USING btree ("package_id","status");--> statement-breakpoint
CREATE INDEX "tender_bids_tenant_project_idx" ON "tender_bids" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_invitees_package_supplier_unique" ON "tender_invitees" USING btree ("package_id","supplier_id");--> statement-breakpoint
CREATE INDEX "tender_invitees_tenant_project_idx" ON "tender_invitees" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_packages_project_code_unique" ON "tender_packages" USING btree ("project_id","package_code");--> statement-breakpoint
CREATE INDEX "tender_packages_tenant_project_status_idx" ON "tender_packages" USING btree ("tenant_id","project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_inventory_transactions_tenant_project_date_idx" ON "warehouse_inventory_transactions" USING btree ("tenant_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "warehouse_inventory_transactions_warehouse_material_idx" ON "warehouse_inventory_transactions" USING btree ("warehouse_id","material_id");--> statement-breakpoint
CREATE INDEX "warehouse_inventory_transactions_requisition_idx" ON "warehouse_inventory_transactions" USING btree ("requisition_id","transaction_type");--> statement-breakpoint
CREATE INDEX "wit_transfer_idx" ON "warehouse_inventory_transactions" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "witf_tenant_project_date_idx" ON "warehouse_inventory_transfers" USING btree ("tenant_id","project_id","transferred_at");--> statement-breakpoint
CREATE INDEX "witf_source_destination_idx" ON "warehouse_inventory_transfers" USING btree ("source_warehouse_id","destination_warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_stocktake_lines_material_unique" ON "warehouse_stocktake_lines" USING btree ("stocktake_id","material_id");--> statement-breakpoint
CREATE INDEX "warehouse_stocktake_lines_tenant_project_idx" ON "warehouse_stocktake_lines" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "warehouse_stocktakes_tenant_project_idx" ON "warehouse_stocktakes" USING btree ("tenant_id","project_id","counted_at");--> statement-breakpoint
CREATE INDEX "warehouse_stocktakes_warehouse_idx" ON "warehouse_stocktakes" USING btree ("warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wbs_items_project_code_unique" ON "wbs_items" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "wbs_items_tenant_project_idx" ON "wbs_items" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_tenant_idx" ON "webhook_deliveries" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_tenant_idx" ON "webhook_endpoints" USING btree ("tenant_id","active");
--> statement-breakpoint
-- PROJECT OS baseline, hand-written part (appended to the generated tables by scripts/build-baseline.mjs; do not apply on its own).
--
-- What it adds to the generated schema, in the order it runs:
--   1. the application role (project_os_app, no login until the database administrator gives it a password);
--   2. updated_at upkeep (MySQL had ON UPDATE CURRENT_TIMESTAMP; PostgreSQL needs a trigger);
--   3. the audit trail made append-only in the database itself: triggers that refuse UPDATE, DELETE and TRUNCATE
--      for everyone, and no UPDATE/DELETE/TRUNCATE privilege for the application role;
--   4. row-level security as the SECOND layer of tenant isolation (the first is still the server, which filters every
--      query by tenant). A query that forgets its tenant filter reads zero foreign rows instead of someone else's;
--   5. project_os_apply_conventions(): one function that (re)applies items 2 and 4 and the grants to EVERY table. The migration
--      runner calls it after every migration, so a table added later is protected without anyone remembering to. A table it
--      cannot classify makes the migration fail, which is the safe direction.
--
-- Limit, stated plainly: the per-request context (app.user_id / app.tenant_ids / app.system) is set by the server, through
-- the same connection the queries use. Row-level security therefore protects against a server function that forgets its tenant
-- filter; it does not protect against someone who can run arbitrary SQL as project_os_app. The role holds no DDL, no TRUNCATE
-- and no UPDATE/DELETE on the audit trail, and a deployment gives it nothing else.

-- 1. roles ---------------------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') THEN
    CREATE ROLE project_os_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
-- Supabase's Data API roles must see nothing here: the application talks to the database over its own connection only.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO project_os_app;
--> statement-breakpoint

-- 2. updated_at ----------------------------------------------------------------------------------------------------------
CREATE FUNCTION project_os_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint

-- 3. the audit trail is append-only --------------------------------------------------------------------------------------
CREATE FUNCTION project_os_audit_logs_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is refused', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_refuse_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION project_os_audit_logs_refuse();
--> statement-breakpoint
CREATE TRIGGER audit_logs_refuse_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION project_os_audit_logs_refuse();
--> statement-breakpoint
CREATE TRIGGER audit_logs_refuse_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION project_os_audit_logs_refuse();
--> statement-breakpoint
-- ALWAYS: a session that sets session_replication_role = replica (the usual way to switch triggers off) still hits them.
ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_refuse_update;
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_refuse_delete;
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_refuse_truncate;
--> statement-breakpoint

-- 4. the per-request context RLS reads ------------------------------------------------------------------------------------
-- Set by the server for the length of one statement or transaction (server/_core/database.ts). With nothing set, no tenant row is visible.
CREATE FUNCTION app_system() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.system', true), 'off') = 'on' $$;
--> statement-breakpoint
CREATE FUNCTION app_user_id() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::integer $$;
--> statement-breakpoint
CREATE FUNCTION app_tenant_ids() RETURNS text[] LANGUAGE sql STABLE AS $$ SELECT coalesce(string_to_array(nullif(current_setting('app.tenant_ids', true), ''), ','), ARRAY[]::text[]) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_system(), app_user_id(), app_tenant_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_system(), app_user_id(), app_tenant_ids() TO project_os_app;
--> statement-breakpoint

-- 5. the convention sweep -------------------------------------------------------------------------------------------------
-- Tables with no tenant_id of their own, and where they get their tenant from.
--   global:  shared reference or identity data, not tenant data (users belong to many companies; plans and permissions are catalogues).
--            Row-level security is still ON for them so the Data API roles get nothing; the application role sees all rows.
--   child:   rows that reach their company through a parent table.
CREATE FUNCTION project_os_apply_conventions() RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE
  t record;
  global_tables constant text[] := ARRAY['users', 'auth_sessions', 'permissions', 'commercial_features', 'commercial_plans', 'plan_feature_entitlements', 'scheduled_jobs', 'self_service_signup_attempts', 'invoice_counters', 'auth_code_attempts'];
  child_tables constant jsonb := '{
    "data_import_errors":            ["import_id",         "data_imports"],
    "data_import_row_results":       ["import_id",         "data_imports"],
    "subcontract_certificate_lines": ["certificate_id",    "subcontract_certificates"],
    "tenant_license_feature_overrides": ["tenant_license_id", "tenant_licenses"],
    "membership_roles":              ["membership_id",     "memberships"],
    "role_permissions":              ["role_id",           "roles"]
  }'::jsonb;
  pred text;
  swept integer := 0;
  child jsonb;
BEGIN
  FOR t IN SELECT c.relname AS name,
                  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS has_tenant,
                  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'updated_at' AND NOT a.attisdropped) AS has_updated
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname
  LOOP
    swept := swept + 1;

    -- updated_at upkeep
    IF t.has_updated THEN
      EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t.name);
      EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION project_os_set_updated_at()', t.name);
    END IF;

    -- grants: everything except what the audit trail is denied
    IF t.name = 'audit_logs' THEN
      EXECUTE format('REVOKE ALL ON %I FROM project_os_app', t.name);
      EXECUTE format('GRANT SELECT, INSERT ON %I TO project_os_app', t.name);
    ELSE
      EXECUTE format('REVOKE ALL ON %I FROM project_os_app', t.name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO project_os_app', t.name);
    END IF;

    -- row-level security
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_isolation ON %I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_read ON %I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_insert ON %I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_update ON %I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_delete ON %I', t.name);
    IF t.name = 'audit_logs' THEN
      pred := format('((SELECT app_system()) OR %I = ANY ((SELECT app_tenant_ids())::text[]))', 'tenant_id');
      EXECUTE format('CREATE POLICY project_os_read ON %I FOR SELECT TO project_os_app USING %s', t.name, pred);
      EXECUTE format('CREATE POLICY project_os_insert ON %I FOR INSERT TO project_os_app WITH CHECK %s', t.name, pred);
    ELSIF t.name = 'companies' THEN
      -- A company is its own tenant: its row is readable, changeable and deletable when its id is among the caller's companies, and a change may not move
      -- the row to another id. CREATING one is a system act (sign-up). Who may change the company is the application's permission check; this layer
      -- only keeps one company's context away from another company's row. (A single FOR ALL policy with a system-only check also refused the owner's own
      -- erasure of their company: the browser rehearsal found it, the database tests ran in a system context and did not.)
      pred := format('((SELECT app_system()) OR %I = ANY ((SELECT app_tenant_ids())::text[]))', 'id');
      EXECUTE format('CREATE POLICY project_os_read ON %I FOR SELECT TO project_os_app USING %s', t.name, pred);
      EXECUTE format('CREATE POLICY project_os_update ON %I FOR UPDATE TO project_os_app USING %s WITH CHECK %s', t.name, pred, pred);
      EXECUTE format('CREATE POLICY project_os_delete ON %I FOR DELETE TO project_os_app USING %s', t.name, pred);
      EXECUTE format('CREATE POLICY project_os_insert ON %I FOR INSERT TO project_os_app WITH CHECK ((SELECT app_system()))', t.name);
    ELSIF t.name = ANY (global_tables) THEN
      EXECUTE format('CREATE POLICY project_os_isolation ON %I FOR ALL TO project_os_app USING (true) WITH CHECK (true)', t.name);
    ELSIF child_tables ? t.name THEN
      child := child_tables -> t.name;
      pred := format('((SELECT app_system()) OR %I IN (SELECT id FROM %I WHERE tenant_id = ANY ((SELECT app_tenant_ids())::text[])))', child ->> 0, child ->> 1);
      EXECUTE format('CREATE POLICY project_os_isolation ON %I FOR ALL TO project_os_app USING %s WITH CHECK %s', t.name, pred, pred);
    ELSIF t.has_tenant THEN
      pred := format('((SELECT app_system()) OR %I = ANY ((SELECT app_tenant_ids())::text[]))', 'tenant_id');
      EXECUTE format('CREATE POLICY project_os_isolation ON %I FOR ALL TO project_os_app USING %s WITH CHECK %s', t.name, pred, pred);
    ELSE
      RAISE EXCEPTION 'table % has no tenant_id and is not classified in project_os_apply_conventions(): add it to global_tables or child_tables', t.name;
    END IF;
  END LOOP;

  -- sequences (the users identity) and the one SECURITY DEFINER helper
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO project_os_app';
  RETURN swept;
END $fn$;
--> statement-breakpoint
-- Statistics refresh after a bulk import. ANALYZE needs ownership; the application role is not the owner, so it goes through this
-- function (SECURITY DEFINER): it analyses only existing public tables from the list it is given, and never audit_logs.
CREATE FUNCTION project_os_analyze(tables text[]) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE name text; done integer := 0;
BEGIN
  FOREACH name IN ARRAY tables LOOP
    IF name <> 'audit_logs' AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = name) THEN
      EXECUTE format('ANALYZE public.%I', name);
      done := done + 1;
    END IF;
  END LOOP;
  RETURN done;
END $$;
--> statement-breakpoint
-- Quality gate on progress (work order 12, item 7). A cell (unit x activity) is "accepted" when the latest ANSWERED inspection request that covers it carries one of the
-- response codes the company counts as an acceptance (tenant_policies.qc_accepted_codes, default A,B). When the company's policy is "block" no path (screen, daily-report
-- approval, bulk import, a script) can move a cell to COMPLETE without that acceptance: the rule sits on the table every path writes to.
CREATE FUNCTION project_os_cell_qc_accepted(p_unit varchar, p_activity varchar) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT r.response_code::text = ANY (string_to_array(COALESCE((SELECT p.qc_accepted_codes FROM tenant_policies p WHERE p.tenant_id = r.tenant_id), 'A,B'), ','))
      FROM pmc_inspection_requests r
      JOIN pmc_inspection_request_units u ON u.inspection_request_id = r.id
     WHERE u.unit_id = p_unit AND r.activity_definition_id = p_activity AND r.response_code IS NOT NULL
     ORDER BY r.requested_at DESC, r.created_at DESC
     LIMIT 1), false)
$$;
--> statement-breakpoint
CREATE FUNCTION project_os_qc_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE completion_mode text;
BEGIN
  IF NEW.status = 'COMPLETE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'COMPLETE') THEN
    SELECT qc_completion_mode::text INTO completion_mode FROM tenant_policies WHERE tenant_id = NEW.tenant_id;
    IF completion_mode = 'block' AND NOT project_os_cell_qc_accepted(NEW.unit_id, NEW.activity_definition_id) THEN
      RAISE EXCEPTION 'QC_NOT_ACCEPTED: unit % activity % has no accepted inspection', NEW.unit_id, NEW.activity_definition_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER pmc_cell_qc_guard BEFORE INSERT OR UPDATE OF status ON pmc_unit_activity_progress FOR EACH ROW EXECUTE FUNCTION project_os_qc_completion_guard();
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_cell_qc_accepted(varchar, varchar), project_os_qc_completion_guard() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION project_os_cell_qc_accepted(varchar, varchar) TO project_os_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_apply_conventions(), project_os_analyze(text[]), project_os_set_updated_at(), project_os_audit_logs_refuse() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION project_os_analyze(text[]) TO project_os_app;
--> statement-breakpoint
SELECT project_os_apply_conventions();
