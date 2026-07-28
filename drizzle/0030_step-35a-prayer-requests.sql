CREATE TABLE "prayer_acts" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"user_id" text,
	"anon_session_id" text,
	"prayed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prayer_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text,
	"anon_session_id" text,
	"anon_name" text,
	"circle_id" text,
	"body" text NOT NULL,
	"source_language" text,
	"status" text DEFAULT 'active' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"message_id" text,
	"shared_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prayer_acts" ADD CONSTRAINT "prayer_acts_request_id_prayer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."prayer_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_acts" ADD CONSTRAINT "prayer_acts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prayer_acts_request_user_idx" ON "prayer_acts" USING btree ("request_id","user_id") WHERE "prayer_acts"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "prayer_acts_request_anon_idx" ON "prayer_acts" USING btree ("request_id","anon_session_id") WHERE "prayer_acts"."anon_session_id" is not null;--> statement-breakpoint
CREATE INDEX "prayer_acts_request_idx" ON "prayer_acts" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "prayer_requests_author_created_idx" ON "prayer_requests" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "prayer_requests_anon_created_idx" ON "prayer_requests" USING btree ("anon_session_id","created_at");--> statement-breakpoint
CREATE INDEX "prayer_requests_message_idx" ON "prayer_requests" USING btree ("message_id");