-- Work order 12, items 8 to 11: API keys and their rate windows, webhooks and their deliveries, the mapping and the log of the exchanges with other systems, what an ERP sent that has no table here, and the connections to a company's other systems. Re-runnable.

DO $$ BEGIN CREATE TYPE "public"."integration_sync_runs_status" AS ENUM('running', 'ok', 'partial', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."webhook_deliveries_status" AS ENUM('pending', 'delivered', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
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
CREATE TABLE IF NOT EXISTS "api_rate_windows" (
	"key_id" varchar(36) NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_rate_windows_key_id_window_start_pk" PRIMARY KEY("key_id","window_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_connections" (
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
CREATE TABLE IF NOT EXISTS "integration_inbound_records" (
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
CREATE TABLE IF NOT EXISTS "integration_mappings" (
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
CREATE TABLE IF NOT EXISTS "integration_sync_items" (
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
CREATE TABLE IF NOT EXISTS "integration_sync_runs" (
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
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
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
CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
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
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_tenant_id_companies_id_fk') THEN ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_created_by_user_id_users_id_fk') THEN ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_rate_windows_key_id_api_keys_id_fk') THEN ALTER TABLE "api_rate_windows" ADD CONSTRAINT "api_rate_windows_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_rate_windows_tenant_id_companies_id_fk') THEN ALTER TABLE "api_rate_windows" ADD CONSTRAINT "api_rate_windows_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_tenant_id_companies_id_fk') THEN ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_created_by_user_id_users_id_fk') THEN ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_inbound_records_tenant_id_companies_id_fk') THEN ALTER TABLE "integration_inbound_records" ADD CONSTRAINT "integration_inbound_records_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_inbound_records_run_id_integration_sync_runs_id_fk') THEN ALTER TABLE "integration_inbound_records" ADD CONSTRAINT "integration_inbound_records_run_id_integration_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."integration_sync_runs"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_mappings_tenant_id_companies_id_fk') THEN ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_sync_items_tenant_id_companies_id_fk') THEN ALTER TABLE "integration_sync_items" ADD CONSTRAINT "integration_sync_items_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_sync_items_run_id_integration_sync_runs_id_fk') THEN ALTER TABLE "integration_sync_items" ADD CONSTRAINT "integration_sync_items_run_id_integration_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."integration_sync_runs"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_sync_runs_tenant_id_companies_id_fk') THEN ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_tenant_id_companies_id_fk') THEN ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_endpoint_id_webhook_endpoints_id_fk') THEN ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_tenant_id_companies_id_fk') THEN ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_created_by_user_id_users_id_fk') THEN ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_prefix_unique" ON "api_keys" USING btree ("key_prefix");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_tenant_idx" ON "api_keys" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_connections_tenant_system_name_unique" ON "integration_connections" USING btree ("tenant_id","system","name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_inbound_records_unique" ON "integration_inbound_records" USING btree ("tenant_id","system","entity_type","external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_mappings_unique" ON "integration_mappings" USING btree ("tenant_id","system","entity_type","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_mappings_internal_idx" ON "integration_mappings" USING btree ("tenant_id","entity_type","internal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_items_run_idx" ON "integration_sync_items" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_items_tenant_outcome_idx" ON "integration_sync_items" USING btree ("tenant_id","outcome");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_runs_tenant_idx" ON "integration_sync_runs" USING btree ("tenant_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_tenant_idx" ON "webhook_deliveries" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_endpoints_tenant_idx" ON "webhook_endpoints" USING btree ("tenant_id","active");
