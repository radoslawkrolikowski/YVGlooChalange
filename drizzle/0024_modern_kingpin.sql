CREATE TABLE "saved_prayers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mode" text DEFAULT 'daily' NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"reading_reference" text,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_prayers" ADD CONSTRAINT "saved_prayers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_prayers_user_created_idx" ON "saved_prayers" USING btree ("user_id","created_at");