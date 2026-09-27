CREATE TABLE "used_challenges" (
	"digest" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "used_challenges_digest_check" CHECK ("used_challenges"."digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "used_challenges_expiry_idx" ON "used_challenges" USING btree ("expires_at");--> statement-breakpoint

-- The used challenges of the proof of work of a sign-up, from record 0115.
-- The runtime role holds no right on the table. It marks one challenge used
-- through one function, which answers whether this call was the first, and the
-- hourly run removes the rows of expired challenges.
ALTER TABLE public.used_challenges ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.used_challenges FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	EXECUTE format(
		'CREATE POLICY used_challenges_owner_policy ON public.used_challenges '
		'FOR ALL TO %I USING (true) WITH CHECK (true)', current_user
	);
END
$$;--> statement-breakpoint

-- Marks one challenge used. Answers true for the first use and false for
-- every later one, so two sign-ups with one solution make one account.
CREATE FUNCTION public.notesapp_use_challenge(
		p_digest text,
		p_expires_at timestamptz)
	RETURNS boolean
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		INSERT INTO public.used_challenges (digest, expires_at)
		VALUES (p_digest, p_expires_at)
		ON CONFLICT (digest) DO NOTHING;
		RETURN FOUND;
	END
	$$;--> statement-breakpoint

-- Removes the rows of the challenges that expired before the cutoff, and
-- answers how many. An expired challenge counts for nothing anyway.
CREATE FUNCTION public.notesapp_prune_challenges(p_cutoff timestamptz)
	RETURNS integer
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		v_removed integer;
	BEGIN
		DELETE FROM public.used_challenges WHERE expires_at < p_cutoff;
		GET DIAGNOSTICS v_removed = ROW_COUNT;
		RETURN v_removed;
	END
	$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.notesapp_use_challenge(text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_prune_challenges(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_use_challenge(text, timestamptz) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_prune_challenges(timestamptz) TO notesapp_app;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the eighteenth entry, so the function reports eighteen.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 18;
$$;
