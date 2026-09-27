-- Custom SQL migration file, put your code below! ---- Open registration verifies an address before the first session, from
-- record 0114.
--
-- Better Auth now refuses a sign-in with an address that nobody proved. Every
-- account of an installation that upgrades was made at the first run or
-- through an invitation, and both prove the address, so every identity user
-- that exists now counts as verified. No installation loses its owner.
UPDATE public.auth_user SET email_verified = true WHERE email_verified = false;--> statement-breakpoint

-- Removes each identity user that nobody verified before the cutoff and that
-- no account links, and answers how many it removed. Such a user is a pending
-- sign-up that expired, or an attempt that failed. Its sessions and its
-- credential go with it through their foreign keys. The hourly run calls it.
CREATE FUNCTION public.notesapp_remove_pending_identities(p_cutoff timestamptz)
	RETURNS integer
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		v_removed integer;
	BEGIN
		DELETE FROM public.auth_user u
		WHERE u.email_verified = false
			AND u.created_at < p_cutoff
			AND NOT EXISTS (SELECT 1 FROM public.account_identities ai
				WHERE ai.auth_user_id = u.id);
		GET DIAGNOSTICS v_removed = ROW_COUNT;
		RETURN v_removed;
	END
	$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_remove_pending_identities(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_remove_pending_identities(timestamptz) TO notesapp_app;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the seventeenth entry, so the function reports seventeen.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 17;
$$;
