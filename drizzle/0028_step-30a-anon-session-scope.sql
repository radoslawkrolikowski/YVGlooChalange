ALTER TABLE "highlights" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_prayers" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "highlights" ADD COLUMN "anon_session_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "anon_session_id" text;--> statement-breakpoint
ALTER TABLE "saved_prayers" ADD COLUMN "anon_session_id" text;--> statement-breakpoint
CREATE INDEX "highlights_anon_session_idx" ON "highlights" USING btree ("anon_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_anon_type_period_idx" ON "notifications" USING btree ("anon_session_id","type","period_key") WHERE "notifications"."anon_session_id" is not null;--> statement-breakpoint
CREATE INDEX "notifications_anon_created_idx" ON "notifications" USING btree ("anon_session_id","created_at");--> statement-breakpoint
CREATE INDEX "saved_prayers_anon_created_idx" ON "saved_prayers" USING btree ("anon_session_id","created_at");