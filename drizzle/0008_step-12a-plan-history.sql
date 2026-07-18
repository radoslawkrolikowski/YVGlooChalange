-- Step 12A: user_plan_progress moves from one-row-per-user to plan history.
-- Composite (user_id, plan_id) key + is_active pointer; the partial unique
-- index enforces at most one active plan per user at the database level.
ALTER TABLE "user_plan_progress" DROP CONSTRAINT "user_plan_progress_pkey";--> statement-breakpoint
ALTER TABLE "user_plan_progress" ADD CONSTRAINT "user_plan_progress_user_id_plan_id_pk" PRIMARY KEY("user_id","plan_id");--> statement-breakpoint
ALTER TABLE "user_plan_progress" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: pre-12A each user had exactly one row — their active plan.
UPDATE "user_plan_progress" SET "is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "user_plan_progress_one_active_idx" ON "user_plan_progress" USING btree ("user_id") WHERE "user_plan_progress"."is_active";
