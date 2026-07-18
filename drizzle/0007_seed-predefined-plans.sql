-- Seed the pre-defined plan starter library (Step 11).
-- References only (USFM), never Bible text — passages are always fetched
-- live from YouVersion. ON CONFLICT guards make a re-run harmless on
-- preview-branch databases.

INSERT INTO "plans" ("id", "name", "description", "length_days", "source") VALUES
	('psalms-30', 'Psalms in 30 Days', 'Thirty days in the Psalms — honest prayers for every season.', 30, 'predefined'),
	('gospel-of-mark', 'The Gospel of Mark', 'Walk straight through Mark''s fast-moving account of Jesus.', 16, 'predefined'),
	('book-of-ruth', 'The Book of Ruth', 'A short story of loyalty, loss, and quiet redemption.', 4, 'predefined')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "plan_days" ("plan_id", "day_number", "reference", "label")
SELECT 'psalms-30', n, 'PSA.' || n, 'Psalm ' || n FROM generate_series(1, 30) AS n
ON CONFLICT ("plan_id", "day_number") DO NOTHING;
--> statement-breakpoint
INSERT INTO "plan_days" ("plan_id", "day_number", "reference", "label")
SELECT 'gospel-of-mark', n, 'MRK.' || n, 'Mark ' || n FROM generate_series(1, 16) AS n
ON CONFLICT ("plan_id", "day_number") DO NOTHING;
--> statement-breakpoint
INSERT INTO "plan_days" ("plan_id", "day_number", "reference", "label")
SELECT 'book-of-ruth', n, 'RUT.' || n, 'Ruth ' || n FROM generate_series(1, 4) AS n
ON CONFLICT ("plan_id", "day_number") DO NOTHING;
