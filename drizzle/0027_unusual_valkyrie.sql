ALTER TABLE "reflections" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "kind" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "anon_session_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "anon_name" text;--> statement-breakpoint
ALTER TABLE "reflections" ADD COLUMN "anon_session_id" text;--> statement-breakpoint
ALTER TABLE "reflections" ADD COLUMN "anon_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;