CREATE TABLE "bible_versions" (
	"id" integer PRIMARY KEY NOT NULL,
	"language" text NOT NULL,
	"abbreviation" text NOT NULL,
	"title" text NOT NULL,
	"copyright" text,
	"deep_link" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bible_versions_language_idx" ON "bible_versions" USING btree ("language");