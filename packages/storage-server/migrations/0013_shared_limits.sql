CREATE TABLE "attempt_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attempt_counters_key_check" CHECK (char_length("attempt_counters"."key") <= 512)
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "attempt_counters_window_idx" ON "attempt_counters" USING btree ("window_started_at");--> statement-breakpoint

-- Every limit and every job holds across server processes, from record 0121.
--
-- The identity role owns the rate limit table of Better Auth, as it owns the
-- other identity tables, and the runtime role holds no right on it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_rate_limit TO notesapp_auth;--> statement-breakpoint
ALTER TABLE public.auth_rate_limit ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.auth_rate_limit FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	EXECUTE format(
		'CREATE POLICY auth_rate_limit_owner_policy ON public.auth_rate_limit '
		'FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
END
$$;--> statement-breakpoint
CREATE POLICY auth_rate_limit_auth_policy ON public.auth_rate_limit
	FOR ALL TO notesapp_auth USING (true) WITH CHECK (true);--> statement-breakpoint

-- The attempt counters of this server are reached through the functions
-- below only. The table holds no identity, so it has an owner policy and no
-- runtime policy.
ALTER TABLE public.attempt_counters ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.attempt_counters FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	EXECUTE format(
		'CREATE POLICY attempt_counters_owner_policy ON public.attempt_counters '
		'FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
END
$$;--> statement-breakpoint

-- Counts one attempt against one key and answers the count and the time left
-- in the window, in milliseconds. One statement does the whole change, so two
-- processes that count one key at the same time both count: the second waits
-- on the row lock of the first and adds to its result. A window that ended
-- starts again at one.
CREATE FUNCTION public.notesapp_count_attempt(p_key text, p_window_ms integer)
	RETURNS TABLE (current integer, ttl_ms integer)
	LANGUAGE sql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		INSERT INTO public.attempt_counters AS c (key, count, window_started_at)
		VALUES (p_key, 1, clock_timestamp())
		ON CONFLICT (key) DO UPDATE SET
			count = CASE
				WHEN c.window_started_at + p_window_ms * interval '1 millisecond'
					<= clock_timestamp() THEN 1
				ELSE c.count + 1 END,
			window_started_at = CASE
				WHEN c.window_started_at + p_window_ms * interval '1 millisecond'
					<= clock_timestamp() THEN clock_timestamp()
				ELSE c.window_started_at END
		RETURNING c.count,
			greatest(0, p_window_ms - (extract(epoch FROM clock_timestamp()
				- c.window_started_at) * 1000)::integer)
	$$;--> statement-breakpoint

-- Answers the count of one key in its window without counting an attempt.
CREATE FUNCTION public.notesapp_read_attempt(p_key text, p_window_ms integer)
	RETURNS TABLE (current integer, ttl_ms integer)
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		SELECT c.count,
			greatest(0, p_window_ms - (extract(epoch FROM clock_timestamp()
				- c.window_started_at) * 1000)::integer)
		FROM public.attempt_counters c
		WHERE c.key = p_key
			AND c.window_started_at + p_window_ms * interval '1 millisecond'
				> clock_timestamp()
	$$;--> statement-breakpoint

-- Deletes the counters whose window started before an instant. The hourly
-- maintenance calls it, so the table holds recent keys only.
CREATE FUNCTION public.notesapp_prune_attempts(p_before timestamptz)
	RETURNS integer
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		removed integer;
	BEGIN
		DELETE FROM public.attempt_counters WHERE window_started_at < p_before;
		GET DIAGNOSTICS removed = ROW_COUNT;
		RETURN removed;
	END
	$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.notesapp_count_attempt(text, integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_read_attempt(text, integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_prune_attempts(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_count_attempt(text, integer) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_read_attempt(text, integer) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_prune_attempts(timestamptz) TO notesapp_app;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the fourteenth entry, so the function reports fourteen.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 14;
$$;
