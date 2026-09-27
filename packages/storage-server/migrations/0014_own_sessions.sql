-- The sessions of an account, from record 0122.
--
-- A person lists the sessions of their own account and ends one of them, or
-- every one but the current one. The runtime role holds no right on the
-- session table, so each operation is one narrow function. Each binds the
-- rows to the account of the transaction through the account map, so no
-- account reads or ends a session of another. No function answers a token.

-- Every session of the account of the transaction that has not expired.
CREATE FUNCTION public.notesapp_account_sessions()
	RETURNS TABLE (
		session_id text,
		user_agent text,
		created_at timestamptz,
		last_active_at timestamptz,
		expires_at timestamptz)
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		SELECT s.id, s.user_agent, s.created_at, s.updated_at, s.expires_at
		FROM public.auth_session s
		JOIN public.account_identities ai ON ai.auth_user_id = s.user_id
		WHERE ai.account_id = public.notesapp_current_account()
			AND s.expires_at > now()
	$$;--> statement-breakpoint

-- Ends one session of the account of the transaction. Answers false for a
-- session that is not one of them, which includes a session of another account.
CREATE FUNCTION public.notesapp_revoke_session(p_session_id text)
	RETURNS boolean
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		DELETE FROM public.auth_session s
		USING public.account_identities ai
		WHERE s.id = p_session_id
			AND ai.auth_user_id = s.user_id
			AND ai.account_id = public.notesapp_current_account();
		RETURN FOUND;
	END
	$$;--> statement-breakpoint

-- Ends every session of the account of the transaction but one, and answers
-- how many ended.
CREATE FUNCTION public.notesapp_revoke_other_sessions(p_keep_session_id text)
	RETURNS integer
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		ended integer;
	BEGIN
		DELETE FROM public.auth_session s
		USING public.account_identities ai
		WHERE s.id <> p_keep_session_id
			AND ai.auth_user_id = s.user_id
			AND ai.account_id = public.notesapp_current_account();
		GET DIAGNOSTICS ended = ROW_COUNT;
		RETURN ended;
	END
	$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.notesapp_account_sessions() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_revoke_session(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_revoke_other_sessions(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_account_sessions() TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_revoke_session(text) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_revoke_other_sessions(text) TO notesapp_app;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the fifteenth entry, so the function reports fifteen.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 15;
$$;
