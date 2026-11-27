CREATE FUNCTION public.notesapp_workspace_invitation_enabled(p_workspace uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT a.collaboration FROM public.accounts a
  WHERE a.id = public.notesapp_workspace_owner(p_workspace)
    AND public.notesapp_is_member(p_workspace)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_workspace_invitation_enabled(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_workspace_invitation_enabled(uuid) TO notesapp_app;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_require_workspace_collaboration(p_workspace uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  enabled boolean;
BEGIN
  -- A controls update takes a conflicting row lock. Hold this lock until commit.
  SELECT a.collaboration INTO enabled FROM public.accounts a
    WHERE a.id = public.notesapp_workspace_owner(p_workspace) FOR SHARE;
  IF enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'The workspace owner cannot add members now' USING ERRCODE = 'NA005';
  END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_require_workspace_collaboration(uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_check_workspace_invite_acceptance()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.notesapp_require_workspace_collaboration(NEW.workspace_id);
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_check_workspace_invite_acceptance() FROM PUBLIC;
--> statement-breakpoint
-- Signed-in acceptance and registration both consume the invitation in the
-- same transaction as the membership. A refusal rolls both writes back.
CREATE TRIGGER workspace_invite_acceptance BEFORE UPDATE OF status ON public.workspace_invitations
  FOR EACH ROW WHEN (OLD.status = 'pending' AND NEW.status = 'accepted')
  EXECUTE FUNCTION public.notesapp_check_workspace_invite_acceptance();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_create_workspace_invite(
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
  PERFORM public.notesapp_require_workspace_collaboration(p_workspace);
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
CREATE OR REPLACE VIEW public.notesapp_pending_workspace_invites AS
  SELECT i.id, i.workspace_id, w.name AS workspace_name, i.email, i.role::text AS role,
    nullif(u.name, '') AS inviter_name, i.expires_at, a.collaboration AS collaboration_enabled
  FROM public.workspace_invitations i JOIN public.workspaces w ON w.id = i.workspace_id
  JOIN public.memberships owner ON owner.workspace_id = w.id AND owner.role = 'owner'
  JOIN public.accounts a ON a.id = owner.account_id
  LEFT JOIN public.account_identities ai ON ai.account_id = i.inviter_id
  LEFT JOIN public.auth_user u ON u.id = ai.auth_user_id
  WHERE i.status = 'pending' AND i.expires_at > now();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_notify_account_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  changed uuid;
BEGIN
  FOR changed IN
    WITH controls AS (
      SELECT n.id, n.collaboration IS DISTINCT FROM o.collaboration AS collaboration_changed
      FROM new_rows n JOIN old_rows o ON o.id = n.id
      WHERE n.state IS DISTINCT FROM o.state
        OR n.removed_at IS DISTINCT FROM o.removed_at
        OR n.controls_revision IS DISTINCT FROM o.controls_revision
        OR n.collaboration IS DISTINCT FROM o.collaboration
    ), workspaces AS (
      SELECT m.workspace_id FROM public.memberships m JOIN controls c ON c.id = m.account_id
      WHERE m.role = 'owner' AND c.collaboration_changed
    )
    SELECT id FROM controls
    UNION
    SELECT m.account_id FROM public.memberships m JOIN workspaces w ON w.workspace_id = m.workspace_id
      WHERE m.role = 'admin'
    UNION
    SELECT ai.account_id FROM public.workspace_invitations i
      JOIN workspaces w ON w.workspace_id = i.workspace_id
      JOIN public.auth_user u ON lower(btrim(u.email)) = i.email
      JOIN public.account_identities ai ON ai.auth_user_id = u.id
      WHERE i.status = 'pending' AND i.expires_at > now() AND u.email_verified
    ORDER BY 1
  LOOP
    PERFORM pg_notify('notesapp_sync', 'a:' || changed::text);
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_schema_version() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT 47; $$;
