CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_name" text NOT NULL,
	"target_id" text NOT NULL,
	"period_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_agent_target_period_idx" ON "agent_runs" USING btree ("agent_name","target_id","period_key");