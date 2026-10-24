ALTER TABLE "accounts" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "trial_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "trial_removal_at" timestamp with time zone;
--> statement-breakpoint
-- An effective standing never waits for the maintenance job or a login.
CREATE FUNCTION public.notesapp_effective_standing(a public.accounts)
RETURNS public.account_standing LANGUAGE sql STABLE
SET search_path = pg_catalog, public AS $$
 SELECT CASE WHEN a.installation_role <> 'administrator'
   AND a.trial_ends_at IS NOT NULL AND a.trial_ended_at IS NULL
   AND a.trial_ends_at <= statement_timestamp()
 THEN 'locked'::public.account_standing ELSE a.standing END;
$$;
REVOKE ALL ON FUNCTION public.notesapp_effective_standing(public.accounts) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notesapp_effective_standing(public.accounts) TO notesapp_app;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_trial_state(a public.accounts) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
 SELECT CASE WHEN a.trial_ends_at IS NULL THEN 'none'
 WHEN a.trial_ended_at IS NOT NULL THEN 'ended'
 WHEN a.trial_ends_at <= statement_timestamp() THEN 'expired' ELSE 'active' END;
$$;
REVOKE ALL ON FUNCTION public.notesapp_trial_state(public.accounts) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notesapp_trial_state(public.accounts) TO notesapp_app;
--> statement-breakpoint
DROP FUNCTION public.notesapp_register_account(text,text,text,uuid,uuid,text,bigint,public.account_standing,bigint);
--> statement-breakpoint
CREATE FUNCTION public.notesapp_register_account(
		p_auth_user_id text,
		p_ground text,
		p_token_digest text,
		p_account_id uuid,
		p_workspace_id uuid,
		p_workspace_name text,
		p_limit_bytes bigint,
		p_standing public.account_standing,
		p_remove_after_seconds bigint,
    p_trial_seconds bigint,
    p_text_limit_bytes bigint,
    p_published_transfer_limit_bytes bigint,
    p_download_limit_bytes bigint,
    p_teams boolean,
    p_collaboration boolean)
	RETURNS uuid
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		linked uuid;
		address text;
		invitation record;
		v_role public.installation_role;
		v_proof public.address_proof;
	BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('notesapp:registration:' || p_auth_user_id)::bigint);
		SELECT ai.account_id INTO linked FROM public.account_identities ai
		WHERE ai.auth_user_id = p_auth_user_id;
		IF linked IS NOT NULL THEN
			RETURN linked;
		END IF;
		SELECT lower(u.email) INTO address FROM public.auth_user u
		WHERE u.id = p_auth_user_id;
		IF address IS NULL THEN
			RETURN NULL;
		END IF;
		IF p_remove_after_seconds IS NOT NULL AND ((p_standing IS DISTINCT FROM 'locked' AND p_trial_seconds IS NULL)
				OR p_remove_after_seconds <= 0) THEN
			RAISE EXCEPTION 'notesapp: only a locked account has a removal time'
				USING ERRCODE = '22023';
		END IF;
    IF p_trial_seconds IS NOT NULL AND (p_trial_seconds <= 0 OR p_trial_seconds > 315360000
      OR p_standing IS DISTINCT FROM 'active'
      OR (p_remove_after_seconds IS NOT NULL AND p_remove_after_seconds <= p_trial_seconds)) THEN
      RAISE EXCEPTION 'notesapp: invalid trial settings' USING ERRCODE = '22023';
    END IF;
		IF p_ground = 'first-run' THEN
			PERFORM public.notesapp_lock_installation();
			IF EXISTS (SELECT 1 FROM public.accounts) THEN
				RETURN NULL;
			END IF;
			v_role := 'administrator';
			v_proof := 'setup';
		ELSIF p_ground = 'invitation' THEN
			SELECT i.id, i.email, i.mailed INTO invitation
			FROM public.invitations i
			WHERE i.token_digest = p_token_digest
				AND i.used_at IS NULL
				AND i.revoked_at IS NULL
				AND i.expires_at > now()
			FOR UPDATE;
			IF NOT FOUND OR invitation.email <> address THEN
				RETURN NULL;
			END IF;
			v_role := 'member';
			v_proof := CASE WHEN invitation.mailed THEN 'mail' ELSE 'administrator' END;
		ELSIF p_ground = 'open' THEN
			IF public.notesapp_registration_policy() IS DISTINCT FROM 'open' THEN
				RETURN NULL;
			END IF;
			v_role := 'member';
			v_proof := 'mail';
		ELSE
			RETURN NULL;
		END IF;
		-- The first account administers the installation, so it is always
		-- active: a locked first account could not unlock anything.
		INSERT INTO public.accounts
			(id, installation_role, state, limit_bytes, address_proof, standing,
				removal_at, created_at, trial_ends_at, trial_removal_at,
        text_limit_bytes, published_transfer_limit_bytes, download_limit_bytes, teams, collaboration)
			VALUES (p_account_id, v_role, 'enabled', p_limit_bytes, v_proof,
				CASE WHEN p_ground = 'first-run' THEN 'active' ELSE p_standing END,
				-- A time is kept to the millisecond, which a reader in the
				-- application holds, so a time that it gives back is equal.
				CASE WHEN p_ground = 'first-run' OR p_remove_after_seconds IS NULL OR p_trial_seconds IS NOT NULL
					THEN NULL
					ELSE date_trunc('milliseconds',
						now() + make_interval(secs => p_remove_after_seconds)) END,
        date_trunc('milliseconds', now()),
        CASE WHEN p_ground <> 'first-run' AND p_trial_seconds IS NOT NULL
          THEN date_trunc('milliseconds', now()) + make_interval(secs => p_trial_seconds) END,
        CASE WHEN p_ground <> 'first-run' AND p_trial_seconds IS NOT NULL AND p_remove_after_seconds IS NOT NULL
          THEN date_trunc('milliseconds', now()) + make_interval(secs => p_remove_after_seconds) END,
        CASE WHEN p_ground <> 'first-run' THEN p_text_limit_bytes END,
        CASE WHEN p_ground <> 'first-run' THEN p_published_transfer_limit_bytes END,
        CASE WHEN p_ground <> 'first-run' THEN p_download_limit_bytes END,
        CASE WHEN p_ground = 'first-run' THEN true ELSE coalesce(p_teams, true) END,
        CASE WHEN p_ground = 'first-run' THEN true ELSE coalesce(p_collaboration, true) END);
		INSERT INTO public.account_identities (auth_user_id, account_id)
			VALUES (p_auth_user_id, p_account_id);
		INSERT INTO public.account_preferences (account_id) VALUES (p_account_id);
		INSERT INTO public.workspaces (id, name, personal)
			VALUES (p_workspace_id, p_workspace_name, true);
		INSERT INTO public.workspace_usage (workspace_id, bytes_used)
			VALUES (p_workspace_id, 0);
		INSERT INTO public.workspace_cursors (workspace_id, last_cursor)
			VALUES (p_workspace_id, 0);
		INSERT INTO public.memberships (workspace_id, account_id, role)
			VALUES (p_workspace_id, p_account_id, 'owner');
		-- The personal workspace records its first membership exactly like a
		-- workspace that an account creates by hand. The cursor moves from zero
		-- to one here, so the sync stream of a new workspace starts at one.
		UPDATE public.workspace_cursors SET last_cursor = 1
			WHERE workspace_id = p_workspace_id;
		INSERT INTO public.sync_changes
			(workspace_id, cursor, entity_kind, entity_id, deleted)
			VALUES (p_workspace_id, 1, 'membership', p_account_id, false);
		IF p_ground = 'invitation' THEN
			UPDATE public.invitations SET used_at = now(), used_by = p_account_id
			WHERE id = invitation.id;
		END IF;
		PERFORM public.notesapp_record_account_event(p_account_id, 'made');
		-- An administrator who invites with no mail vouches for the address,
		-- and no message proved it, so that account has no verified event.
		IF v_proof IS DISTINCT FROM 'administrator' THEN
			PERFORM public.notesapp_record_account_event(p_account_id, 'verified');
		END IF;
		RETURN p_account_id;
	END
	$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_register_account(text,text,text,uuid,uuid,text,bigint,public.account_standing,bigint,bigint,bigint,bigint,bigint,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notesapp_register_account(text,text,text,uuid,uuid,text,bigint,public.account_standing,bigint,bigint,bigint,bigint,bigint,boolean,boolean) TO notesapp_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_session_standing(p_auth_user_id text)
	RETURNS TABLE (account_id uuid, standing text)
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		SELECT a.id, public.notesapp_effective_standing(a)::text FROM public.account_identities ai
		JOIN public.accounts a ON a.id = ai.account_id
		WHERE ai.auth_user_id = p_auth_user_id
			AND a.state = 'enabled'
			AND a.removed_at IS NULL
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_api_key_identity(p_digest text)
RETURNS TABLE (account_id uuid, auth_user_id text, standing public.account_standing, email text, name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY WITH used AS (
    UPDATE public.api_keys k SET last_used_at = now()
    FROM public.accounts a
    WHERE k.token_digest = p_digest AND k.expires_at > now()
      AND a.id = k.account_id AND a.state = 'enabled' AND a.removed_at IS NULL
    RETURNING k.account_id
  ) SELECT a.id, ai.auth_user_id, public.notesapp_effective_standing(a), u.email, u.name
    FROM used k JOIN public.accounts a ON a.id = k.account_id
    JOIN public.account_identities ai ON ai.account_id = a.id
    JOIN public.auth_user u ON u.id = ai.auth_user_id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_oauth_token_identity(p_digest text, p_resource text)
RETURNS TABLE(account_id uuid, auth_user_id text, standing public.account_standing, grant_id text, scopes text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE token public.auth_oauth_access_token%ROWTYPE;
BEGIN
  SELECT t.* INTO token FROM public.auth_oauth_access_token t WHERE t.token = p_digest;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.notesapp_oauth_lock_pair(token.client_id, token.user_id);
  RETURN QUERY WITH usable AS (
    SELECT t.* FROM public.auth_oauth_access_token t JOIN public.auth_oauth_client c ON c.client_id = t.client_id
    WHERE t.id = token.id AND t.revoked IS NULL AND t.expires_at > clock_timestamp()
      AND t.resources = ARRAY[p_resource] AND c.disabled IS NOT TRUE
  ), used AS (
    UPDATE public.auth_oauth_client c SET last_used_at = clock_timestamp() FROM usable t WHERE c.client_id = t.client_id
      AND (c.last_used_at IS NULL OR c.last_used_at < now() - interval '1 day')
  ) SELECT a.id, ai.auth_user_id, public.notesapp_effective_standing(a), c.id, ARRAY(SELECT scope FROM unnest(t.scopes) AS scope WHERE scope = ANY(c.scopes))
    FROM usable t JOIN public.auth_oauth_consent c ON c.client_id = t.client_id AND c.user_id = t.user_id
    JOIN public.account_identities ai ON ai.auth_user_id = t.user_id
    JOIN public.accounts a ON a.id = ai.account_id WHERE a.state = 'enabled' AND a.removed_at IS NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_oauth_consent_allowed(p_user text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT public.notesapp_oauth_issue_allowed(p_user) AND EXISTS (
   SELECT 1 FROM public.accounts a JOIN public.account_identities ai ON ai.account_id = a.id
   WHERE ai.auth_user_id = p_user AND public.notesapp_effective_standing(a) = 'active');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_account_usage(p_workspace_id uuid)
	RETURNS TABLE (
		used_bytes bigint,
		limit_bytes bigint,
		text_bytes bigint,
		text_limit_bytes bigint,
		standing text)
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		owner_id uuid;
	BEGIN
		IF NOT public.notesapp_is_member(p_workspace_id) THEN
			RAISE EXCEPTION 'notesapp: the account is not a member of this workspace'
				USING ERRCODE = '42501';
		END IF;
		owner_id := public.notesapp_workspace_owner(p_workspace_id);
		IF owner_id IS NULL THEN
			RAISE EXCEPTION 'notesapp: the workspace has no owner'
				USING ERRCODE = '23503';
		END IF;
		PERFORM public.notesapp_lock_account(owner_id);
		RETURN QUERY
		SELECT coalesce((SELECT sum(w.bytes_used) FROM public.workspace_usage w
				JOIN public.memberships m ON m.workspace_id = w.workspace_id
				WHERE m.account_id = owner_id AND m.role = 'owner'), 0)::bigint,
			a.limit_bytes,
			coalesce((SELECT sum(w.text_bytes) FROM public.workspace_usage w
				JOIN public.memberships m ON m.workspace_id = w.workspace_id
				WHERE m.account_id = owner_id AND m.role = 'owner'), 0)::bigint,
			a.text_limit_bytes,
			public.notesapp_effective_standing(a)::text
		FROM public.accounts a WHERE a.id = owner_id;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_workspace_writable(p_workspace_id uuid)
	RETURNS boolean
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		SELECT coalesce((
			SELECT public.notesapp_effective_standing(a) = 'active' FROM public.accounts a
			WHERE a.id = public.notesapp_workspace_owner(p_workspace_id)
		), true)
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_account_writable(p_account_id uuid)
	RETURNS boolean
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		SELECT coalesce((
			SELECT public.notesapp_effective_standing(a) = 'active' FROM public.accounts a
			WHERE a.id = p_account_id
		), true)
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_publication_by_token(p_token_digest text)
	RETURNS TABLE (
		publication_id uuid,
		workspace_id uuid,
		owner_account_id uuid,
		scope_kind text,
		scope_file_id uuid,
		scope_path text,
		password_protected boolean,
		created_at timestamptz,
		expires_at timestamptz,
		revoked_at timestamptz
	)
	LANGUAGE plpgsql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		RETURN QUERY
		SELECT pub.id, pub.workspace_id, pub.owner_account_id,
			pub.scope_kind::text, pub.scope_file_id, pub.scope_path,
			pub.password_digest IS NOT NULL,
			pub.created_at, pub.expires_at, pub.revoked_at
		FROM public.publications pub
		JOIN public.accounts a
			ON a.id = public.notesapp_workspace_owner(pub.workspace_id)
		WHERE pub.token_digest = p_token_digest
			AND public.notesapp_effective_standing(a) = 'active';
	END;
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_create_api_key(p_id uuid, p_name text, p_digest text, p_days integer)
RETURNS TABLE (key_id uuid, name text, created_at timestamptz, expires_at timestamptz, last_used_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE account uuid := public.notesapp_current_account();
BEGIN
  -- The account lock orders creation, disable, removal and the bound.
  PERFORM 1 FROM public.accounts a WHERE a.id = account AND a.state = 'enabled'
    AND a.removed_at IS NULL AND public.notesapp_effective_standing(a) = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'notesapp: key creation is refused' USING ERRCODE = '42501'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 OR p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$'
    OR p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 80 OR p_name <> btrim(p_name)
    OR p_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'notesapp: key input is refused' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.api_keys k WHERE k.account_id = account) >= 25 THEN RETURN; END IF;
  RETURN QUERY INSERT INTO public.api_keys AS k (id, account_id, name, token_digest, expires_at)
    VALUES (p_id, account, p_name, p_digest, now() + p_days * interval '1 day')
    RETURNING k.id, k.name, k.created_at, k.expires_at, k.last_used_at;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_set_profile_name(p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 256 OR p_name <> btrim(p_name) THEN
    RAISE EXCEPTION 'notesapp: profile input is refused' USING ERRCODE = '22023';
  END IF;
  UPDATE public.auth_user u SET name = p_name, updated_at = now()
    FROM public.account_identities ai JOIN public.accounts a ON a.id = ai.account_id
    WHERE u.id = ai.auth_user_id AND a.id = public.notesapp_current_account()
      AND a.state = 'enabled' AND a.removed_at IS NULL AND public.notesapp_effective_standing(a) = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'notesapp: profile change is refused' USING ERRCODE = '42501'; END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_set_account_controls(
		p_account_id uuid,
		p_revision bigint,
		p_standing public.account_standing,
		p_removal_at timestamptz,
		p_limit_bytes bigint,
		p_text_limit_bytes bigint,
		p_published_transfer_limit_bytes bigint,
		p_download_limit_bytes bigint,
		p_teams boolean,
		p_collaboration boolean)
	RETURNS text
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		stored bigint;
	BEGIN
		PERFORM public.notesapp_lock_installation();
		IF NOT public.notesapp_is_administrator()
			AND NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only an administrator or the operator can change the controls'
				USING ERRCODE = '42501';
		END IF;
		PERFORM public.notesapp_lock_account(p_account_id);
		SELECT a.controls_revision INTO stored FROM public.accounts a
		WHERE a.id = p_account_id AND a.removed_at IS NULL;
		IF stored IS NULL THEN
			RETURN 'missing';
		END IF;
		IF stored <> p_revision THEN
			RETURN 'changed';
		END IF;
		UPDATE public.accounts SET
			standing = p_standing,
      trial_ended_at = CASE WHEN trial_ends_at IS NOT NULL THEN coalesce(trial_ended_at, clock_timestamp()) END,
			removal_notices = CASE WHEN removal_at IS DISTINCT FROM
					date_trunc('milliseconds', p_removal_at)
				THEN 0 ELSE removal_notices END,
			removal_at = date_trunc('milliseconds', p_removal_at),
			limit_bytes = p_limit_bytes,
			text_limit_bytes = p_text_limit_bytes,
			published_transfer_limit_bytes = p_published_transfer_limit_bytes,
			download_limit_bytes = p_download_limit_bytes,
			teams = p_teams,
			collaboration = p_collaboration,
			controls_revision = controls_revision + 1
		WHERE id = p_account_id;
		IF public.notesapp_is_administrator() THEN
			PERFORM public.notesapp_audit_administration(p_account_id,
				'installation.controls');
		ELSE
			INSERT INTO public.account_audit_events
				(id, account_id, action, target_kind, target_id)
			VALUES (gen_random_uuid(), p_account_id, 'installation.controls',
				'operator', NULL);
		END IF;
		RETURN 'written';
	END
	$$;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_end_admin_trial() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 IF NEW.trial_ends_at IS NOT NULL AND
   (NEW.installation_role = 'administrator' OR NEW.limit_bytes IS DISTINCT FROM OLD.limit_bytes) THEN
   NEW.trial_ended_at := coalesce(NEW.trial_ended_at, clock_timestamp());
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notesapp_end_admin_trial() FROM PUBLIC;
CREATE TRIGGER accounts_end_admin_trial BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.notesapp_end_admin_trial();
--> statement-breakpoint
DROP FUNCTION public.notesapp_list_accounts();
--> statement-breakpoint
CREATE FUNCTION public.notesapp_list_accounts()
	RETURNS TABLE (
		account_id uuid,
		email text,
		name text,
		installation_role text,
		state text,
		created_at timestamptz,
		last_active_at timestamptz,
		used_bytes bigint,
		limit_bytes bigint,
		standing text,
		removal_at timestamptz,
		text_limit_bytes bigint,
		published_transfer_limit_bytes bigint,
		download_limit_bytes bigint,
		teams boolean,
		collaboration boolean,
		controls_revision bigint,
    trial_ends_at timestamptz, trial_ended_at timestamptz, trial_state text)
	LANGUAGE plpgsql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		PERFORM public.notesapp_require_administrator();
		RETURN QUERY
		SELECT a.id, u.email, u.name, a.installation_role::text, a.state::text,
			a.created_at,
			(SELECT max(s.updated_at) FROM public.auth_session s
				WHERE s.user_id = ai.auth_user_id),
			coalesce((SELECT sum(w.bytes_used) FROM public.workspace_usage w
				JOIN public.memberships m ON m.workspace_id = w.workspace_id
				WHERE m.account_id = a.id AND m.role = 'owner'), 0)::bigint,
			a.limit_bytes,
			public.notesapp_effective_standing(a)::text,
			CASE WHEN public.notesapp_effective_standing(a) = 'locked' AND a.trial_ended_at IS NULL AND a.trial_ends_at IS NOT NULL THEN coalesce(a.removal_at, a.trial_removal_at) ELSE a.removal_at END,
			a.text_limit_bytes,
			a.published_transfer_limit_bytes,
			a.download_limit_bytes,
			a.teams,
			a.collaboration,
			a.controls_revision, a.trial_ends_at, a.trial_ended_at, public.notesapp_trial_state(a)
		FROM public.accounts a
		LEFT JOIN public.account_identities ai ON ai.account_id = a.id
		LEFT JOIN public.auth_user u ON u.id = ai.auth_user_id
		WHERE a.removed_at IS NULL
		ORDER BY a.created_at, a.id;
	END
	$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_list_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notesapp_list_accounts() TO notesapp_app;
--> statement-breakpoint
DROP FUNCTION public.notesapp_account_controls(uuid,date);
--> statement-breakpoint
CREATE FUNCTION public.notesapp_account_controls(
		p_account_id uuid,
		p_month date)
	RETURNS TABLE (
		account_id uuid,
		email text,
		installation_role text,
		state text,
		created_at timestamptz,
		standing text,
		removal_at timestamptz,
		limit_bytes bigint,
		text_limit_bytes bigint,
		published_transfer_limit_bytes bigint,
		download_limit_bytes bigint,
		teams boolean,
		collaboration boolean,
		controls_revision bigint,
    trial_ends_at timestamptz, trial_ended_at timestamptz, trial_state text,
		used_bytes bigint,
		text_bytes bigint,
		published_transfer_bytes bigint,
		download_bytes bigint)
	LANGUAGE plpgsql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF NOT public.notesapp_is_administrator()
			AND NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only an administrator or the operator can read the controls'
				USING ERRCODE = '42501';
		END IF;
		RETURN QUERY
		SELECT a.id, u.email, a.installation_role::text, a.state::text,
			a.created_at, public.notesapp_effective_standing(a)::text,
			CASE WHEN public.notesapp_effective_standing(a) = 'locked' AND a.trial_ended_at IS NULL AND a.trial_ends_at IS NOT NULL THEN coalesce(a.removal_at, a.trial_removal_at) ELSE a.removal_at END, a.limit_bytes, a.text_limit_bytes,
			a.published_transfer_limit_bytes, a.download_limit_bytes,
			a.teams, a.collaboration, a.controls_revision, a.trial_ends_at, a.trial_ended_at, public.notesapp_trial_state(a),
			coalesce((SELECT sum(w.bytes_used) FROM public.workspace_usage w
				JOIN public.memberships m ON m.workspace_id = w.workspace_id
				WHERE m.account_id = a.id AND m.role = 'owner'), 0)::bigint,
			coalesce((SELECT sum(w.text_bytes) FROM public.workspace_usage w
				JOIN public.memberships m ON m.workspace_id = w.workspace_id
				WHERE m.account_id = a.id AND m.role = 'owner'), 0)::bigint,
			coalesce(mu.published_transfer_bytes, 0)::bigint,
			coalesce(mu.download_bytes, 0)::bigint
		FROM public.accounts a
		LEFT JOIN public.account_identities ai ON ai.account_id = a.id
		LEFT JOIN public.auth_user u ON u.id = ai.auth_user_id
		LEFT JOIN public.monthly_usage mu
			ON mu.account_id = a.id AND mu.month = p_month
		WHERE a.id = p_account_id AND a.removed_at IS NULL;
	END
	$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_account_controls(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notesapp_account_controls(uuid,date) TO notesapp_app;
--> statement-breakpoint
-- Conditional writes and the account lock order the sweep with controls.
-- A second run changes no row and cannot extend the removal deadline.
CREATE FUNCTION public.notesapp_expire_account_trials() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE candidate uuid; total integer := 0;
BEGIN
 IF NOT public.notesapp_is_operator() THEN
   RAISE EXCEPTION 'notesapp: only the operator can expire trials' USING ERRCODE = '42501';
 END IF;
 FOR candidate IN SELECT a.id FROM public.accounts a
   WHERE a.trial_ends_at <= statement_timestamp() AND a.trial_ended_at IS NULL
     AND a.standing = 'active' AND a.installation_role = 'member'
     AND a.removed_at IS NULL ORDER BY a.id
 LOOP
   PERFORM public.notesapp_lock_account(candidate);
   UPDATE public.accounts SET standing = 'locked', removal_at = trial_removal_at,
     controls_revision = controls_revision + 1
   WHERE id = candidate AND trial_ends_at <= statement_timestamp() AND trial_ended_at IS NULL
     AND standing = 'active' AND installation_role = 'member' AND removed_at IS NULL;
   IF FOUND THEN total := total + 1; END IF;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.notesapp_expire_account_trials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notesapp_expire_account_trials() TO notesapp_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_schema_version() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT 43; $$;
--> statement-breakpoint
