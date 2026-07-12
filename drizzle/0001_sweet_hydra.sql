CREATE TABLE "agent_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_name" text NOT NULL,
	"model" text,
	"status" text NOT NULL,
	"output_preview" text,
	"error" text,
	"latency_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
