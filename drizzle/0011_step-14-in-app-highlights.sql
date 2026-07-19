DROP INDEX "highlights_user_version_reference_idx";--> statement-breakpoint
ALTER TABLE "highlights" ADD COLUMN "source" text DEFAULT 'imported' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "highlights_user_version_reference_idx" ON "highlights" USING btree ("user_id","version_id","reference") WHERE "highlights"."source" = 'imported';