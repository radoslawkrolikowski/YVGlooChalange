CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
INSERT INTO "app_meta" ("key", "value") VALUES ('app_name', 'round') ON CONFLICT ("key") DO NOTHING;
