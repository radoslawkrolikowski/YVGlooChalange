CREATE TABLE "reflections" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"author_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"reference" text NOT NULL,
	"label" text NOT NULL,
	"body" text NOT NULL,
	"source_language" text,
	"flagged" boolean DEFAULT false NOT NULL,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "kind" text DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "day_number" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "day_label" text;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reflections_circle_day_idx" ON "reflections" USING btree ("circle_id","day_number");