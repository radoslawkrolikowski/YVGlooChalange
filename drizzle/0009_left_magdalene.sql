CREATE TABLE "highlights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reference" text NOT NULL,
	"label" text,
	"version_id" integer NOT NULL,
	"version_abbreviation" text,
	"snippet" text,
	"color" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "highlights_consent" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "highlights_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "highlights_user_version_reference_idx" ON "highlights" USING btree ("user_id","version_id","reference");--> statement-breakpoint
CREATE INDEX "highlights_user_idx" ON "highlights" USING btree ("user_id");