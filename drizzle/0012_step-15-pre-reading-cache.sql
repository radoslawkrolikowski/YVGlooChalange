CREATE TABLE "pre_reading_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reference" text NOT NULL,
	"language" text NOT NULL,
	"prompts" text[] NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pre_reading_prompts" ADD CONSTRAINT "pre_reading_prompts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pre_reading_prompts_user_reference_idx" ON "pre_reading_prompts" USING btree ("user_id","reference");