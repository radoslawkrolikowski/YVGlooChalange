CREATE TABLE "plan_days" (
	"plan_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"reference" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "plan_days_plan_id_day_number_pk" PRIMARY KEY("plan_id","day_number")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"length_days" integer NOT NULL,
	"source" text DEFAULT 'predefined' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_plan_progress" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_days" integer[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plan_progress" ADD CONSTRAINT "user_plan_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plan_progress" ADD CONSTRAINT "user_plan_progress_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;