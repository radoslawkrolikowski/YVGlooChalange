CREATE TABLE "conversation_starters" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"reference" text NOT NULL,
	"label" text NOT NULL,
	"questions" text[] DEFAULT '{}' NOT NULL,
	"language" text NOT NULL,
	"model" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_starters" ADD CONSTRAINT "conversation_starters_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_starters" ADD CONSTRAINT "conversation_starters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_starters" ADD CONSTRAINT "conversation_starters_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_starters_user_circle_day_idx" ON "conversation_starters" USING btree ("user_id","circle_id","day_number");