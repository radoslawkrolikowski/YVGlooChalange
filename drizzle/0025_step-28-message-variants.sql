CREATE TABLE "message_variants" (
	"message_id" text NOT NULL,
	"language" text NOT NULL,
	"body" text NOT NULL,
	"questions" text[],
	"synthesis" text,
	"overlap_theme" text,
	"question" text,
	"summary" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_variants_message_id_language_pk" PRIMARY KEY("message_id","language")
);
--> statement-breakpoint
ALTER TABLE "message_variants" ADD CONSTRAINT "message_variants_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;