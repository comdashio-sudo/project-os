-- Work order 16, item 7 (G-189): the saved Master Plan drawing. The drawing of one master plan version, its file versions (an upload never deletes an earlier one),
-- the polygons the reader found, and the links a person confirmed from a polygon to a unit (the matcher's proposals are never stored here).
-- Re-runnable. Rollback: drop the four tables; nothing else in the database refers to them.
CREATE TABLE IF NOT EXISTS "master_plan_drawings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"master_plan_version_id" varchar(36) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "master_plan_drawing_versions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"drawing_id" varchar(36) NOT NULL,
	"version_number" integer NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"page_count" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"uploaded_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "master_plan_drawing_polygons" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"drawing_id" varchar(36) NOT NULL,
	"ref" varchar(80) NOT NULL,
	"label" varchar(120) DEFAULT '' NOT NULL,
	"points" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "master_plan_drawing_links" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"drawing_id" varchar(36) NOT NULL,
	"polygon_id" varchar(36) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"confirmed_by_user_id" integer NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpd_tenant_fk') THEN ALTER TABLE "master_plan_drawings" ADD CONSTRAINT "mpd_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpd_project_fk') THEN ALTER TABLE "master_plan_drawings" ADD CONSTRAINT "mpd_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpd_version_fk') THEN ALTER TABLE "master_plan_drawings" ADD CONSTRAINT "mpd_version_fk" FOREIGN KEY ("master_plan_version_id") REFERENCES "public"."master_plan_versions"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpd_creator_fk') THEN ALTER TABLE "master_plan_drawings" ADD CONSTRAINT "mpd_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdv_tenant_fk') THEN ALTER TABLE "master_plan_drawing_versions" ADD CONSTRAINT "mpdv_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdv_project_fk') THEN ALTER TABLE "master_plan_drawing_versions" ADD CONSTRAINT "mpdv_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdv_drawing_fk') THEN ALTER TABLE "master_plan_drawing_versions" ADD CONSTRAINT "mpdv_drawing_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."master_plan_drawings"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdv_uploader_fk') THEN ALTER TABLE "master_plan_drawing_versions" ADD CONSTRAINT "mpdv_uploader_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdp_tenant_fk') THEN ALTER TABLE "master_plan_drawing_polygons" ADD CONSTRAINT "mpdp_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdp_project_fk') THEN ALTER TABLE "master_plan_drawing_polygons" ADD CONSTRAINT "mpdp_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdp_drawing_fk') THEN ALTER TABLE "master_plan_drawing_polygons" ADD CONSTRAINT "mpdp_drawing_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."master_plan_drawings"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdl_tenant_fk') THEN ALTER TABLE "master_plan_drawing_links" ADD CONSTRAINT "mpdl_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdl_project_fk') THEN ALTER TABLE "master_plan_drawing_links" ADD CONSTRAINT "mpdl_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdl_drawing_fk') THEN ALTER TABLE "master_plan_drawing_links" ADD CONSTRAINT "mpdl_drawing_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."master_plan_drawings"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdl_polygon_fk') THEN ALTER TABLE "master_plan_drawing_links" ADD CONSTRAINT "mpdl_polygon_fk" FOREIGN KEY ("polygon_id") REFERENCES "public"."master_plan_drawing_polygons"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdl_entity_fk') THEN ALTER TABLE "master_plan_drawing_links" ADD CONSTRAINT "mpdl_entity_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."master_plan_spatial_entities"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdl_confirmer_fk') THEN ALTER TABLE "master_plan_drawing_links" ADD CONSTRAINT "mpdl_confirmer_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "master_plan_drawings_version_unique" ON "master_plan_drawings" USING btree ("master_plan_version_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "master_plan_drawings_tenant_project_idx" ON "master_plan_drawings" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "master_plan_drawing_versions_drawing_version_unique" ON "master_plan_drawing_versions" USING btree ("drawing_id","version_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "master_plan_drawing_versions_tenant_project_drawing_idx" ON "master_plan_drawing_versions" USING btree ("tenant_id","project_id","drawing_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "master_plan_drawing_polygons_drawing_ref_unique" ON "master_plan_drawing_polygons" USING btree ("drawing_id","ref");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "master_plan_drawing_polygons_tenant_project_drawing_idx" ON "master_plan_drawing_polygons" USING btree ("tenant_id","project_id","drawing_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "master_plan_drawing_links_polygon_unique" ON "master_plan_drawing_links" USING btree ("polygon_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "master_plan_drawing_links_drawing_entity_unique" ON "master_plan_drawing_links" USING btree ("drawing_id","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "master_plan_drawing_links_tenant_project_drawing_idx" ON "master_plan_drawing_links" USING btree ("tenant_id","project_id","drawing_id");
