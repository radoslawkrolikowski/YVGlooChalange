CREATE TABLE "digests" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"reference" text NOT NULL,
	"label" text NOT NULL,
	"synthesis" text,
	"overlap_members" text[] DEFAULT '{}' NOT NULL,
	"overlap_theme" text,
	"question" text,
	"language" text NOT NULL,
	"model" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "digests_circle_day_idx" ON "digests" USING btree ("circle_id","day_number");