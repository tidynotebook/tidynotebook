ALTER TYPE "public"."membership_role" ADD VALUE 'admin';--> statement-breakpoint
ALTER TYPE "public"."membership_role" ADD VALUE 'editor';--> statement-breakpoint
ALTER TYPE "public"."membership_role" ADD VALUE 'viewer';--> statement-breakpoint
CREATE TABLE "note_client_bindings" (
	"workspace_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"epoch" integer NOT NULL,
	"client_id" bigint NOT NULL,
	"account_id" uuid NOT NULL,
	"can_write" boolean NOT NULL,
	CONSTRAINT "note_client_bindings_workspace_id_file_id_epoch_client_id_pk" PRIMARY KEY("workspace_id","file_id","epoch","client_id"),
	CONSTRAINT "note_client_bindings_id_check" CHECK ("note_client_bindings"."client_id" between 0 and 4294967295),
	CONSTRAINT "note_client_bindings_epoch_check" CHECK ("note_client_bindings"."epoch" > 0)
);
--> statement-breakpoint
CREATE TABLE "revision_contributors" (
	"workspace_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "revision_contributors_workspace_id_revision_id_account_id_pk" PRIMARY KEY("workspace_id","revision_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"inviter_id" uuid,
	"token_digest" text NOT NULL,
	"sealed_token" text,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"accepting_account_id" uuid,
	CONSTRAINT "workspace_invitations_token_digest_unique" UNIQUE("token_digest"),
	CONSTRAINT "workspace_invitations_role_check" CHECK ("workspace_invitations"."role" <> 'owner'),
	CONSTRAINT "workspace_invitations_email_check" CHECK (length("workspace_invitations"."email") between 3 and 320 and lower(btrim("workspace_invitations"."email")) = "workspace_invitations"."email"),
	CONSTRAINT "workspace_invitations_digest_check" CHECK ("workspace_invitations"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "workspace_invitations_status_check" CHECK ("workspace_invitations"."status" in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
	CONSTRAINT "workspace_invitations_seal_check" CHECK (("workspace_invitations"."status" = 'pending') = ("workspace_invitations"."sealed_token" is not null))
);
--> statement-breakpoint
ALTER TABLE "note_client_bindings" ADD CONSTRAINT "note_client_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_contributors" ADD CONSTRAINT "revision_contributors_workspace_id_revision_id_revisions_workspace_id_id_fk" FOREIGN KEY ("workspace_id","revision_id") REFERENCES "public"."revisions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_inviter_id_accounts_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepting_account_id_accounts_id_fk" FOREIGN KEY ("accepting_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_pending_idx" ON "workspace_invitations" USING btree ("workspace_id","email") WHERE "workspace_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "workspace_invitations_address_idx" ON "workspace_invitations" USING btree ("email","id") WHERE "workspace_invitations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_owner_idx" ON "memberships" USING btree ("workspace_id") WHERE "memberships"."role" = 'owner';
--> statement-breakpoint
-- Reads stay available to members. Content writes require a current write role.
DO $$
DECLARE
  scoped text[] := ARRAY[
    'workspace_usage', 'workspace_cursors', 'files', 'live_paths', 'contents',
    'revisions', 'revision_parents', 'changesets', 'purge_markers',
    'sync_changes', 'search_index', 'attachment_objects', 'note_documents',
    'note_links', 'daily_note_settings', 'template_settings',
    'note_client_bindings', 'revision_contributors'
  ];
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['workspace_invitations', 'note_client_bindings', 'revision_contributors'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', name);
    EXECUTE format('CREATE POLICY collaboration_schema_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)', name, current_user);
  END LOOP;

  FOREACH name IN ARRAY scoped LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', name || '_member_policy', name);
    EXECUTE format('CREATE POLICY workspace_read ON public.%I FOR SELECT TO notesapp_app USING (public.notesapp_is_member(workspace_id))', name);
    EXECUTE format(
      'CREATE POLICY workspace_write ON public.%I FOR ALL TO notesapp_app
        USING (public.notesapp_member_role(workspace_id) IN (''owner'', ''admin'', ''editor''))
        WITH CHECK (public.notesapp_member_role(workspace_id) IN (''owner'', ''admin'', ''editor''))',
      name);
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.memberships FROM notesapp_app;
--> statement-breakpoint
DROP POLICY memberships_insert_policy ON public.memberships;
--> statement-breakpoint
DROP POLICY memberships_update_policy ON public.memberships;
--> statement-breakpoint
DROP POLICY memberships_delete_policy ON public.memberships;
--> statement-breakpoint
ALTER POLICY accounts_member_policy ON public.accounts
  USING (id = public.notesapp_current_account());
--> statement-breakpoint
ALTER POLICY workspaces_update_policy ON public.workspaces
  USING (public.notesapp_member_role(id) IN ('owner', 'admin'))
  WITH CHECK (public.notesapp_member_role(id) IN ('owner', 'admin'));
--> statement-breakpoint
ALTER POLICY publications_member_policy ON public.publications
  USING (public.notesapp_member_role(workspace_id) IN ('owner', 'admin'))
  WITH CHECK (public.notesapp_member_role(workspace_id) IN ('owner', 'admin')
    AND owner_account_id = public.notesapp_workspace_owner(workspace_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON public.note_client_bindings, public.revision_contributors TO notesapp_app;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_new_personal_workspace(p_account uuid, p_workspace uuid, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, personal) VALUES (p_workspace, p_name, true);
  INSERT INTO public.workspace_usage (workspace_id, bytes_used) VALUES (p_workspace, 0);
  INSERT INTO public.workspace_cursors (workspace_id, last_cursor) VALUES (p_workspace, 1);
  INSERT INTO public.memberships (workspace_id, account_id, role) VALUES (p_workspace, p_account, 'owner');
  INSERT INTO public.sync_changes (workspace_id, cursor, entity_kind, entity_id, deleted)
    VALUES (p_workspace, 1, 'membership', p_account, false);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_new_personal_workspace(uuid, uuid, text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_membership_changed(p_workspace uuid, p_account uuid, p_removed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  next_cursor bigint;
BEGIN
  UPDATE public.workspace_cursors SET last_cursor = last_cursor + 1
    WHERE workspace_id = p_workspace RETURNING last_cursor INTO STRICT next_cursor;
  INSERT INTO public.sync_changes (workspace_id, cursor, entity_kind, entity_id, deleted)
    VALUES (p_workspace, next_cursor, 'membership', p_account, p_removed);
  PERFORM pg_notify('notesapp_sync', 'a:' || p_account::text);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_membership_changed(uuid, uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_verified_workspace_email(p_account uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT lower(btrim(u.email)) FROM public.account_identities ai
  JOIN public.auth_user u ON u.id = ai.auth_user_id
  WHERE ai.account_id = p_account AND u.email_verified
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_verified_workspace_email(uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_workspace_member_page(p_workspace uuid, p_after uuid, p_member uuid DEFAULT NULL)
RETURNS TABLE(account_id uuid, display_name text, email text, role text, member_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.notesapp_is_member(p_workspace) THEN
    RAISE EXCEPTION 'Workspace access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.account_id, nullif(u.name, ''), u.email, m.role::text,
      (SELECT count(*) FROM public.memberships tally WHERE tally.workspace_id = p_workspace)
    FROM public.memberships m
    JOIN public.account_identities ai ON ai.account_id = m.account_id
    JOIN public.auth_user u ON u.id = ai.auth_user_id
    WHERE m.workspace_id = p_workspace AND (p_after IS NULL OR m.account_id > p_after)
      AND (p_member IS NULL OR m.account_id = p_member)
    ORDER BY m.account_id LIMIT 101;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_change_workspace_member(p_workspace uuid, p_member uuid, p_role text, p_leave boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  caller uuid := public.notesapp_current_account();
  caller_role text;
  target_role text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace::text)::bigint);
  caller_role := public.notesapp_member_role(p_workspace);
  IF p_leave IS NULL OR caller_role IS NULL OR (p_leave AND (caller <> p_member OR p_role IS NOT NULL))
    OR (NOT p_leave AND (caller_role NOT IN ('owner', 'admin') OR (p_role IS NULL AND caller = p_member))) THEN
    RETURN 'forbidden';
  END IF;
  PERFORM public.notesapp_require_writable(p_workspace);
  PERFORM public.notesapp_lock_account(p_member);
  SELECT m.role::text INTO target_role FROM public.memberships m
    WHERE m.workspace_id = p_workspace AND m.account_id = p_member;
  IF target_role IS NULL THEN RETURN 'not_found'; END IF;
  IF target_role = 'owner' THEN RETURN 'forbidden'; END IF;
  IF p_role IS NOT NULL THEN
    IF p_role NOT IN ('admin', 'editor', 'viewer') THEN RETURN 'forbidden'; END IF;
    IF target_role <> p_role THEN
      UPDATE public.memberships SET role = p_role::public.membership_role
        WHERE workspace_id = p_workspace AND account_id = p_member;
      PERFORM public.notesapp_membership_changed(p_workspace, p_member, false);
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.memberships
      WHERE account_id = p_member AND workspace_id <> p_workspace) THEN
      IF p_leave THEN RETURN 'last_workspace'; END IF;
      PERFORM public.notesapp_new_personal_workspace(p_member, gen_random_uuid(), 'Personal');
    END IF;
    DELETE FROM public.memberships WHERE workspace_id = p_workspace AND account_id = p_member;
    PERFORM public.notesapp_membership_changed(p_workspace, p_member, true);
  END IF;
  RETURN 'ok';
END $$;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_transfer_stranded_members(p_workspace uuid, p_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  member_id uuid;
BEGIN
  FOR member_id IN SELECT account_id FROM public.memberships
    WHERE workspace_id = p_workspace AND account_id <> p_owner LOOP
    IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE account_id = member_id AND workspace_id <> p_workspace) THEN
      PERFORM public.notesapp_new_personal_workspace(member_id, gen_random_uuid(), 'Personal');
    END IF;
    PERFORM public.notesapp_membership_changed(p_workspace, member_id, true);
  END LOOP;
  PERFORM pg_notify('notesapp_sync', 'a:' || p_owner::text);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_transfer_stranded_members(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_delete_workspace(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  caller uuid := public.notesapp_current_account();
  member_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text)::bigint);
  IF public.notesapp_member_role(p_workspace_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the owner can delete a workspace' USING ERRCODE = '42501';
  END IF;
  PERFORM public.notesapp_require_writable(p_workspace_id);
  FOR member_id IN SELECT account_id FROM public.memberships
    WHERE workspace_id = p_workspace_id ORDER BY account_id LOOP
    PERFORM public.notesapp_lock_account(member_id);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE account_id = caller AND workspace_id <> p_workspace_id) THEN
    RAISE EXCEPTION 'An account keeps its last workspace' USING ERRCODE = '42501';
  END IF;
  PERFORM public.notesapp_transfer_stranded_members(p_workspace_id, caller);
  PERFORM public.notesapp_erase_workspace(p_workspace_id);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_create_workspace_invite(
  p_workspace uuid, p_id uuid, p_email text, p_role text, p_digest text, p_seal text
)
RETURNS TABLE(outcome text, invitation_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  pending_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace::text)::bigint);
  IF coalesce(public.notesapp_member_role(p_workspace), '') NOT IN ('owner', 'admin')
    OR p_role NOT IN ('admin', 'editor', 'viewer') THEN
    RAISE EXCEPTION 'Member management is required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.notesapp_require_writable(p_workspace);
  UPDATE public.workspace_invitations SET status = 'expired', sealed_token = NULL
    WHERE workspace_id = p_workspace AND status = 'pending' AND expires_at <= now();
  IF EXISTS (SELECT 1 FROM public.memberships m
    JOIN public.account_identities ai ON ai.account_id = m.account_id
    JOIN public.auth_user u ON u.id = ai.auth_user_id
    WHERE m.workspace_id = p_workspace AND lower(btrim(u.email)) = p_email) THEN
    RETURN QUERY SELECT 'already_member'::text, NULL::uuid;
    RETURN;
  END IF;
  SELECT id INTO pending_id FROM public.workspace_invitations
    WHERE workspace_id = p_workspace AND status = 'pending' AND email = p_email;
  IF pending_id IS NOT NULL THEN
    RETURN QUERY SELECT 'pending_invite'::text, pending_id;
  ELSIF (SELECT count(*) FROM public.workspace_invitations WHERE workspace_id = p_workspace AND status = 'pending') >= 100 THEN
    RETURN QUERY SELECT 'pending_limit'::text, NULL::uuid;
  ELSE
    INSERT INTO public.workspace_invitations (id, workspace_id, email, role, inviter_id, token_digest, sealed_token, expires_at)
      VALUES (p_id, p_workspace, p_email, p_role::public.membership_role, public.notesapp_current_account(), p_digest, p_seal, now() + interval '7 days');
    RETURN QUERY SELECT 'created'::text, p_id;
  END IF;
END $$;
--> statement-breakpoint
-- The view is private to the schema role and narrow functions below.
CREATE VIEW public.notesapp_pending_workspace_invites AS
  SELECT i.id, i.workspace_id, w.name AS workspace_name, i.email, i.role::text AS role,
    nullif(u.name, '') AS inviter_name, i.expires_at
  FROM public.workspace_invitations i JOIN public.workspaces w ON w.id = i.workspace_id
  LEFT JOIN public.account_identities ai ON ai.account_id = i.inviter_id
  LEFT JOIN public.auth_user u ON u.id = ai.auth_user_id
  WHERE i.status = 'pending' AND i.expires_at > now();
--> statement-breakpoint
CREATE FUNCTION public.notesapp_workspace_invite_details(p_digest text)
RETURNS SETOF public.notesapp_pending_workspace_invites
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT v.* FROM public.notesapp_pending_workspace_invites v
  JOIN public.workspace_invitations i ON i.id = v.id
  WHERE i.token_digest = p_digest
$$;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_workspace_invite_list(p_workspace uuid, p_after uuid)
RETURNS SETOF public.notesapp_pending_workspace_invites
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_workspace IS NULL THEN
    RETURN QUERY SELECT * FROM public.notesapp_pending_workspace_invites i
      WHERE i.email = public.notesapp_verified_workspace_email(public.notesapp_current_account())
        AND (p_after IS NULL OR i.id > p_after)
      ORDER BY i.id LIMIT 101;
  ELSE
    IF coalesce(public.notesapp_member_role(p_workspace), '') NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'Member management is required' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT * FROM public.notesapp_pending_workspace_invites i
      WHERE i.workspace_id = p_workspace ORDER BY i.expires_at, i.id;
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_admin_workspace_invite(p_workspace uuid, p_id uuid, p_revoke boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  token text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace::text)::bigint);
  IF coalesce(public.notesapp_member_role(p_workspace), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Member management is required' USING ERRCODE = '42501';
  END IF;
  SELECT sealed_token INTO token FROM public.workspace_invitations
    WHERE id = p_id AND workspace_id = p_workspace AND status = 'pending' AND expires_at > now();
  IF p_revoke AND token IS NOT NULL THEN
    PERFORM public.notesapp_require_writable(p_workspace);
    UPDATE public.workspace_invitations SET status = 'revoked', sealed_token = NULL WHERE id = p_id;
    RETURN 'revoked';
  END IF;
  RETURN token;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_answer_workspace_invite(p_id uuid, p_accept boolean)
RETURNS TABLE(workspace_id uuid, name text, personal boolean, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  caller uuid := public.notesapp_current_account();
  selected public.workspace_invitations%ROWTYPE;
BEGIN
  IF NOT public.notesapp_account_writable(caller) THEN RETURN; END IF;
  SELECT i.workspace_id INTO selected.workspace_id FROM public.workspace_invitations i WHERE i.id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(selected.workspace_id::text)::bigint);
  PERFORM public.notesapp_lock_account(caller);
  SELECT i.* INTO selected FROM public.workspace_invitations i WHERE i.id = p_id FOR UPDATE;
  IF NOT FOUND OR selected.email IS DISTINCT FROM public.notesapp_verified_workspace_email(caller) THEN RETURN; END IF;
  IF selected.status = 'pending' AND selected.expires_at > now() THEN
    IF p_accept THEN
      INSERT INTO public.memberships (workspace_id, account_id, role)
        VALUES (selected.workspace_id, caller, selected.role)
        ON CONFLICT ON CONSTRAINT memberships_workspace_id_account_id_pk DO NOTHING;
      IF FOUND THEN PERFORM public.notesapp_membership_changed(selected.workspace_id, caller, false); END IF;
      UPDATE public.workspace_invitations SET status = 'accepted', sealed_token = NULL, accepting_account_id = caller WHERE id = p_id;
    ELSE
      UPDATE public.workspace_invitations SET status = 'declined', sealed_token = NULL WHERE id = p_id;
      RETURN QUERY SELECT w.id, w.name, w.personal, selected.role::text
        FROM public.workspaces w WHERE w.id = selected.workspace_id;
      RETURN;
    END IF;
  ELSIF NOT p_accept OR selected.status <> 'accepted' OR selected.accepting_account_id IS DISTINCT FROM caller THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT w.id, w.name, w.personal, m.role::text FROM public.workspaces w
    JOIN public.memberships m ON m.workspace_id = w.id AND m.account_id = caller
    WHERE w.id = selected.workspace_id;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'notesapp_workspace_member_page(uuid, uuid, uuid)',
    'notesapp_change_workspace_member(uuid, uuid, text, boolean)',
    'notesapp_create_workspace_invite(uuid, uuid, text, text, text, text)',
    'notesapp_workspace_invite_details(text)',
    'notesapp_workspace_invite_list(uuid, uuid)',
    'notesapp_admin_workspace_invite(uuid, uuid, boolean)',
    'notesapp_answer_workspace_invite(uuid, boolean)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || signature || ' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || signature || ' TO notesapp_app';
  END LOOP;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_register_account(
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
    workspace_invitation public.workspace_invitations%ROWTYPE;
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
			IF FOUND THEN
        IF invitation.email <> address THEN RETURN NULL; END IF;
        v_proof := CASE WHEN invitation.mailed THEN 'mail' ELSE 'administrator' END;
      ELSE
        SELECT * INTO workspace_invitation FROM public.workspace_invitations i
          WHERE i.token_digest = p_token_digest;
        IF NOT FOUND THEN RETURN NULL; END IF;
        PERFORM pg_advisory_xact_lock(hashtext(workspace_invitation.workspace_id::text)::bigint);
        SELECT * INTO workspace_invitation FROM public.workspace_invitations i
          WHERE i.token_digest = p_token_digest AND i.status = 'pending' AND i.expires_at > now()
          FOR UPDATE;
        IF NOT FOUND OR workspace_invitation.email <> address THEN RETURN NULL; END IF;
        v_proof := 'mail';
      END IF;
      v_role := 'member';
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
		PERFORM public.notesapp_new_personal_workspace(p_account_id, p_workspace_id, p_workspace_name);
    IF workspace_invitation.id IS NOT NULL THEN
      INSERT INTO public.memberships (workspace_id, account_id, role)
        VALUES (workspace_invitation.workspace_id, p_account_id, workspace_invitation.role);
      UPDATE public.workspace_invitations SET status = 'accepted', sealed_token = NULL, accepting_account_id = p_account_id
        WHERE id = workspace_invitation.id;
      PERFORM public.notesapp_membership_changed(workspace_invitation.workspace_id, p_account_id, false);
    ELSIF p_ground = 'invitation' THEN
      UPDATE public.invitations SET used_at = now(), used_by = p_account_id WHERE id = invitation.id;
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
CREATE OR REPLACE FUNCTION public.notesapp_preview_purge(
	p_workspace_id uuid,
	p_file_ids uuid[]
)
RETURNS TABLE (
	file_ids uuid[],
	revision_ids uuid[],
	content_digests text[],
	attachment_object_ids uuid[],
	blocking_kind text[],
	blocking_target_id text[],
	blocking_referrer_id text[],
	blocking_description text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_file_ids uuid[];
	v_revision_ids uuid[];
	v_content_digests text[];
	v_attachment_object_ids uuid[];
	v_blocking_kind text[] := ARRAY[]::text[];
	v_blocking_target_id text[] := ARRAY[]::text[];
	v_blocking_referrer_id text[] := ARRAY[]::text[];
	v_blocking_description text[] := ARRAY[]::text[];
	v_ref RECORD;
BEGIN
	IF coalesce(public.notesapp_member_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
		RAISE EXCEPTION 'notesapp: only an owner or admin can preview purge'
			USING ERRCODE = '42501';
	END IF;

	SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_file_ids
	FROM public.files
	WHERE workspace_id = p_workspace_id AND id = ANY(p_file_ids);

	SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_revision_ids
	FROM public.revisions
	WHERE workspace_id = p_workspace_id AND file_id = ANY(p_file_ids);

	SELECT coalesce(array_agg(DISTINCT content_digest), ARRAY[]::text[]) INTO v_content_digests
	FROM public.revisions
	WHERE workspace_id = p_workspace_id AND file_id = ANY(p_file_ids);

	SELECT coalesce(array_agg(DISTINCT c.object_id), ARRAY[]::uuid[]) INTO v_attachment_object_ids
	FROM public.contents c
	JOIN public.revisions r ON r.workspace_id = c.workspace_id AND r.content_digest = c.digest
	WHERE c.workspace_id = p_workspace_id
	  AND r.file_id = ANY(p_file_ids)
	  AND c.object_id IS NOT NULL;

	-- Check for external revisions referencing these attachment objects
	FOR v_ref IN
		SELECT DISTINCT c.object_id as target_id, r.id as referrer_id
		FROM public.contents c
		JOIN public.revisions r ON r.workspace_id = c.workspace_id AND r.content_digest = c.digest
		WHERE c.workspace_id = p_workspace_id
		  AND c.object_id = ANY(v_attachment_object_ids)
		  AND NOT (r.file_id = ANY(p_file_ids))
	LOOP
		v_blocking_kind := array_append(v_blocking_kind, 'revision');
		v_blocking_target_id := array_append(v_blocking_target_id, v_ref.target_id::text);
		v_blocking_referrer_id := array_append(v_blocking_referrer_id, v_ref.referrer_id::text);
		v_blocking_description := array_append(v_blocking_description, 'Attachment is referenced by a revision outside the purge set.');
	END LOOP;

	RETURN QUERY SELECT
		v_file_ids,
		v_revision_ids,
		v_content_digests,
		v_attachment_object_ids,
		v_blocking_kind,
		v_blocking_target_id,
		v_blocking_referrer_id,
		v_blocking_description;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_purge_files(
	p_workspace_id uuid,
	p_file_ids uuid[]
)
RETURNS TABLE (
	purged_file_ids uuid[],
	purged_revision_ids uuid[],
	reclaimed_bytes bigint,
	unreferenced_object_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_blocking_count integer;
	v_purged_file_ids uuid[];
	v_purged_revision_ids uuid[];
	v_attachment_object_ids uuid[];
	v_reclaimed_content_bytes bigint := 0;
	v_reclaimed_attachment_bytes bigint := 0;
	v_reclaimed_overhead_bytes bigint := 0;
	v_total_reclaimed bigint := 0;
	v_unreferenced_objects uuid[];
BEGIN
	IF coalesce(public.notesapp_member_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
		RAISE EXCEPTION 'notesapp: only an owner or admin can purge files'
			USING ERRCODE = '42501';
	END IF;
	-- A locked owner purges nothing (record 0201).
	PERFORM public.notesapp_require_writable(p_workspace_id);

	SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_purged_file_ids
	FROM public.files
	WHERE workspace_id = p_workspace_id AND id = ANY(p_file_ids);

	SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_purged_revision_ids
	FROM public.revisions
	WHERE workspace_id = p_workspace_id AND file_id = ANY(p_file_ids);

	SELECT coalesce(array_agg(DISTINCT c.object_id), ARRAY[]::uuid[]) INTO v_attachment_object_ids
	FROM public.contents c
	JOIN public.revisions r ON r.workspace_id = c.workspace_id AND r.content_digest = c.digest
	WHERE c.workspace_id = p_workspace_id
	  AND r.file_id = ANY(p_file_ids)
	  AND c.object_id IS NOT NULL;

	-- Validate no external revisions reference these attachment objects
	IF array_length(v_attachment_object_ids, 1) > 0 THEN
		SELECT count(*) INTO v_blocking_count
		FROM public.contents c
		JOIN public.revisions r ON r.workspace_id = c.workspace_id AND r.content_digest = c.digest
		WHERE c.workspace_id = p_workspace_id
		  AND c.object_id = ANY(v_attachment_object_ids)
		  AND NOT (r.file_id = ANY(p_file_ids));

		IF v_blocking_count > 0 THEN
			RAISE EXCEPTION 'notesapp: attachment is referenced outside the purge set'
				USING ERRCODE = '23503';
		END IF;
	END IF;

	PERFORM set_config('notesapp.purge', 'on', true);

	DELETE FROM public.search_index
	WHERE workspace_id = p_workspace_id AND file_id = ANY(p_file_ids);

	-- A live snapshot may pin a revision that this purge removes. Its items go
	-- first, so the foreign key to `revisions` holds.
	DELETE FROM public.snapshot_items
	WHERE workspace_id = p_workspace_id
	  AND revision_id = ANY(v_purged_revision_ids);

	DELETE FROM public.live_paths
	WHERE workspace_id = p_workspace_id AND file_id = ANY(p_file_ids);

	UPDATE public.files
	SET head_revision_id = NULL
	WHERE workspace_id = p_workspace_id AND id = ANY(p_file_ids);

	DELETE FROM public.revision_parents
	WHERE workspace_id = p_workspace_id
	  AND (child_id = ANY(v_purged_revision_ids) OR parent_id = ANY(v_purged_revision_ids));

	DELETE FROM public.revisions
	WHERE workspace_id = p_workspace_id AND file_id = ANY(p_file_ids);

	-- The document of a note is workspace data of that note, so a permanent
	-- deletion removes it with the note itself (records 0081, 0083).
	DELETE FROM public.note_documents
	WHERE workspace_id = p_workspace_id AND file_id = ANY(p_file_ids);

	DELETE FROM public.files
	WHERE workspace_id = p_workspace_id AND id = ANY(p_file_ids);

	INSERT INTO public.purge_markers (workspace_id, file_id, purged_at)
	SELECT p_workspace_id, unnest(p_file_ids), clock_timestamp()
	ON CONFLICT (workspace_id, file_id) DO NOTHING;

	-- Reclaim orphaned content bytes, and the part of them that attachments
	-- held, so the text sum falls by the rest.
	SELECT coalesce(sum(size), 0),
		coalesce(sum(size) FILTER (WHERE c.kind = 'attachment'), 0)
	INTO v_reclaimed_content_bytes, v_reclaimed_attachment_bytes
	FROM public.contents c
	WHERE c.workspace_id = p_workspace_id
	  AND NOT EXISTS (
		SELECT 1 FROM public.revisions r
		WHERE r.workspace_id = p_workspace_id AND r.content_digest = c.digest
	  );

	-- Find unreferenced attachment objects that are safe to mark
	SELECT coalesce(array_agg(ao.id), ARRAY[]::uuid[]) INTO v_unreferenced_objects
	FROM public.attachment_objects ao
	WHERE ao.workspace_id = p_workspace_id
	  AND ao.state = 'finalized'
	  AND ao.finalized_at < clock_timestamp() - interval '24 hours'
	  AND NOT EXISTS (
		SELECT 1 FROM public.contents c
		WHERE c.workspace_id = p_workspace_id AND c.object_id = ao.id
	  );

	UPDATE public.attachment_objects
	SET state = 'unavailable'
	WHERE workspace_id = p_workspace_id AND id = ANY(v_unreferenced_objects);

	DELETE FROM public.contents c
	WHERE c.workspace_id = p_workspace_id
	  AND NOT EXISTS (
		SELECT 1 FROM public.revisions r
		WHERE r.workspace_id = p_workspace_id AND r.content_digest = c.digest
	  );

	v_reclaimed_overhead_bytes := coalesce(array_length(v_purged_revision_ids, 1), 0)::bigint * 1024;
	v_total_reclaimed := v_reclaimed_content_bytes + v_reclaimed_overhead_bytes;

	IF v_total_reclaimed > 0 THEN
		UPDATE public.workspace_usage
		SET bytes_used = greatest(0, bytes_used - v_total_reclaimed),
			text_bytes = greatest(0, least(
				text_bytes - (v_total_reclaimed - v_reclaimed_attachment_bytes),
				bytes_used - v_total_reclaimed))
		WHERE workspace_id = p_workspace_id;
	END IF;

	PERFORM set_config('notesapp.purge', 'off', true);

	RETURN QUERY SELECT
		v_purged_file_ids,
		v_purged_revision_ids,
		v_total_reclaimed,
		v_unreferenced_objects;
END;
$$;

--> statement-breakpoint
CREATE FUNCTION public.notesapp_bind_note_client(p_workspace uuid, p_file uuid, p_epoch integer, p_client bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  caller uuid := public.notesapp_current_account();
  caller_role text;
  binding public.note_client_bindings%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace::text)::bigint);
  caller_role := public.notesapp_member_role(p_workspace);
  IF caller_role IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.note_documents d JOIN public.files f
    ON f.workspace_id = d.workspace_id AND f.id = d.file_id
    WHERE d.workspace_id = p_workspace AND d.file_id = p_file AND d.epoch = p_epoch AND NOT f.deleted
  ) THEN RETURN false; END IF;
  INSERT INTO public.note_client_bindings (workspace_id, file_id, epoch, client_id, account_id, can_write)
    VALUES (p_workspace, p_file, p_epoch, p_client, caller, caller_role <> 'viewer' AND public.notesapp_workspace_writable(p_workspace))
    ON CONFLICT DO NOTHING;
  SELECT * INTO binding FROM public.note_client_bindings
    WHERE workspace_id = p_workspace AND file_id = p_file AND epoch = p_epoch AND client_id = p_client;
  RETURN binding.account_id = caller;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_bind_note_client(uuid, uuid, integer, bigint) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_bind_note_client(uuid, uuid, integer, bigint) TO notesapp_app;
--> statement-breakpoint
DROP POLICY workspace_write ON public.note_client_bindings;
--> statement-breakpoint
CREATE POLICY claim_own_note_client ON public.note_client_bindings FOR INSERT TO notesapp_app
  WITH CHECK (account_id = public.notesapp_current_account() AND can_write
    AND public.notesapp_member_role(workspace_id) IN ('owner', 'admin', 'editor'));
--> statement-breakpoint
CREATE FUNCTION public.notesapp_revision_contributors(p_workspace uuid, p_revisions uuid[])
RETURNS TABLE(revision_id uuid, account_id uuid, display_name text, former_member boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.notesapp_is_member(p_workspace) THEN
    RAISE EXCEPTION 'Workspace access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT r.id, m.account_id, nullif(u.name, ''), m.account_id IS NULL
    FROM public.revisions r
    LEFT JOIN public.revision_contributors c ON c.workspace_id = r.workspace_id AND c.revision_id = r.id
    LEFT JOIN public.memberships m ON m.workspace_id = r.workspace_id AND m.account_id = coalesce(c.account_id, r.actor_account_id)
    LEFT JOIN public.account_identities ai ON ai.account_id = m.account_id
    LEFT JOIN public.auth_user u ON u.id = ai.auth_user_id
    WHERE r.workspace_id = p_workspace AND r.id = ANY(p_revisions)
    ORDER BY r.id, coalesce(c.account_id, r.actor_account_id);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_revision_contributors(uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_revision_contributors(uuid, uuid[]) TO notesapp_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_record_account_event(
		p_account_id uuid,
		p_kind public.account_event_kind)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		PERFORM pg_advisory_xact_lock(hashtext('notesapp:account-events')::bigint);
		INSERT INTO public.account_events (cursor, account_id, kind)
		SELECT coalesce(max(e.cursor), 0) + 1, p_account_id, p_kind
		FROM public.account_events e;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_next_cursor(p_workspace_id uuid) RETURNS bigint
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		allocated bigint;
	BEGIN
		IF coalesce(public.notesapp_member_role(p_workspace_id), '') NOT IN ('owner', 'admin', 'editor') THEN
			RAISE EXCEPTION 'notesapp: the account is not a member of this workspace'
				USING ERRCODE = '42501';
		END IF;
		PERFORM public.notesapp_require_writable(p_workspace_id);
		UPDATE public.workspace_cursors
		SET last_cursor = last_cursor + 1
		WHERE workspace_id = p_workspace_id
		RETURNING last_cursor INTO allocated;
		IF allocated IS NULL THEN
			RAISE EXCEPTION 'notesapp: the workspace has no cursor record'
				USING ERRCODE = '23503';
		END IF;
		RETURN allocated;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_remove_account(p_account_id uuid)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		target record;
    affected uuid;
		held record;
	BEGIN
		PERFORM public.notesapp_lock_installation();
		IF public.notesapp_current_account() IS DISTINCT FROM p_account_id
			AND NOT public.notesapp_is_administrator()
			AND NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the account or an administrator can remove it'
				USING ERRCODE = '42501';
		END IF;
		SELECT a.installation_role, a.state INTO target FROM public.accounts a
		WHERE a.id = p_account_id AND a.removed_at IS NULL;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'notesapp: no such account' USING ERRCODE = 'P0002';
		END IF;
		IF public.notesapp_current_account() = p_account_id
			AND target.state <> 'enabled' THEN
			RAISE EXCEPTION 'notesapp: a disabled account cannot remove itself'
				USING ERRCODE = '42501';
		END IF;
		PERFORM public.notesapp_keep_administrator(p_account_id,
			target.installation_role, target.state, true);
		FOR held IN
			SELECT m.workspace_id, m.role FROM public.memberships m
			WHERE m.account_id = p_account_id ORDER BY m.workspace_id
		LOOP
			PERFORM pg_advisory_xact_lock(hashtext(held.workspace_id::text)::bigint);
		END LOOP;
		FOR affected IN
      SELECT p_account_id
      UNION SELECT member.account_id FROM public.memberships member
        JOIN public.memberships account_owner ON account_owner.workspace_id = member.workspace_id
        WHERE account_owner.account_id = p_account_id AND account_owner.role = 'owner'
      ORDER BY 1
    LOOP
      PERFORM public.notesapp_lock_account(affected);
    END LOOP;
		FOR held IN
			SELECT m.workspace_id, m.role FROM public.memberships m
			WHERE m.account_id = p_account_id ORDER BY m.workspace_id
		LOOP
			IF held.role = 'owner' THEN
				PERFORM public.notesapp_transfer_stranded_members(held.workspace_id, p_account_id);
				PERFORM public.notesapp_erase_workspace(held.workspace_id);
			ELSE
				DELETE FROM public.memberships
				WHERE workspace_id = held.workspace_id AND account_id = p_account_id;
        PERFORM public.notesapp_membership_changed(held.workspace_id, p_account_id, true);
			END IF;
		END LOOP;
		DELETE FROM public.account_preferences WHERE account_id = p_account_id;
		DELETE FROM public.account_audit_events WHERE account_id = p_account_id;
		DELETE FROM public.account_handoffs WHERE account_id = p_account_id;
		DELETE FROM public.auth_user u
		USING public.account_identities ai
		WHERE ai.account_id = p_account_id AND u.id = ai.auth_user_id;
		UPDATE public.accounts SET
			removed_at = now(),
			state = 'disabled',
			installation_role = 'member',
			address_proof = NULL,
			removal_at = NULL,
			removal_notices = 0
		WHERE id = p_account_id;
		PERFORM public.notesapp_record_account_event(p_account_id, 'removed');
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_schema_version() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT 45; $$;
