CREATE TABLE "escalation_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"reflection_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "escalation_audit_ref_idx" ON "escalation_audit" USING btree ("reflection_ref");