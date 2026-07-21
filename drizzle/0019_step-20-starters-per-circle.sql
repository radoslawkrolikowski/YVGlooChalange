DROP INDEX "conversation_starters_user_circle_day_idx";--> statement-breakpoint
-- Starters were keyed per (user, circle, day), so a circle whose members all
-- finished the same day holds one row per member. The new key is one card per
-- (circle, day), so collapse each group to its EARLIEST row — the first
-- finisher's, which is the one the new rule would have produced.
--
-- Deleting the losing rows' thread messages is what removes them: the
-- conversation_starters.message_id foreign key is ON DELETE CASCADE, so the
-- starters row goes with its message and no orphaned Round card is left
-- rendering in the thread.
DELETE FROM "messages" WHERE "id" IN (
	SELECT "message_id" FROM (
		SELECT "message_id",
			row_number() OVER (
				PARTITION BY "circle_id", "day_number" ORDER BY "created_at", "id"
			) AS rn
		FROM "conversation_starters"
		WHERE "message_id" IS NOT NULL
	) ranked
	WHERE rn > 1
);--> statement-breakpoint
-- Unposted claim rows (a generation that failed, or one still in flight) have
-- no message to cascade from, so drop the surplus ones directly.
DELETE FROM "conversation_starters" WHERE "id" IN (
	SELECT "id" FROM (
		SELECT "id",
			row_number() OVER (
				PARTITION BY "circle_id", "day_number"
				ORDER BY ("message_id" IS NULL), "created_at", "id"
			) AS rn
		FROM "conversation_starters"
	) ranked
	WHERE rn > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_starters_circle_day_idx" ON "conversation_starters" USING btree ("circle_id","day_number");
