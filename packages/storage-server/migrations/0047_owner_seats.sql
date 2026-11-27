ALTER TYPE "public"."account_event_kind" ADD VALUE 'workspace_member_added';--> statement-breakpoint
ALTER TYPE "public"."account_event_kind" ADD VALUE 'workspace_member_removed';--> statement-breakpoint
ALTER TABLE "account_events" ADD COLUMN "owner_account_id" uuid;--> statement-breakpoint
ALTER TABLE "account_events" ADD COLUMN "member_account_id" uuid;--> statement-breakpoint
ALTER TABLE "account_events" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "account_events" ADD COLUMN "owner_workspace_memberships" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "member_limit" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_member_limit_check" CHECK ("accounts"."member_limit" between 0 and 10000);
CREATE FUNCTION public.notesapp_account_member_limit(p_account uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT a.member_limit FROM public.accounts a WHERE a.id = p_account
    AND (p_account = public.notesapp_current_account()
      OR public.notesapp_is_administrator() OR public.notesapp_is_operator())
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_account_member_limit(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_account_member_limit(uuid) TO notesapp_app;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_set_account_controls(
  p_account uuid, p_revision bigint, p_standing public.account_standing, p_removal_at timestamptz,
  p_limit bigint, p_text bigint, p_transfer bigint, p_download bigint, p_teams boolean,
  p_collaboration boolean, p_member_limit integer
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  outcome text;
BEGIN
  outcome := public.notesapp_set_account_controls(p_account, p_revision, p_standing,
    p_removal_at, p_limit, p_text, p_transfer, p_download, p_teams, p_collaboration);
  IF outcome = 'written' THEN
    UPDATE public.accounts SET member_limit = p_member_limit
      WHERE id = p_account AND member_limit IS DISTINCT FROM p_member_limit;
  END IF;
  RETURN outcome;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_set_account_controls(uuid, bigint, public.account_standing, timestamptz, bigint, bigint, bigint, bigint, boolean, boolean, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_set_account_controls(uuid, bigint, public.account_standing, timestamptz, bigint, bigint, bigint, bigint, boolean, boolean, integer) TO notesapp_app;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_owner_seat_counts(p_owner uuid, p_emails text[])
RETURNS TABLE(members_used integer, pending_invites integer, additional_places integer)
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  WITH owned AS MATERIALIZED (
    SELECT workspace_id FROM public.memberships WHERE account_id = p_owner AND role = 'owner'
  ), counted AS MATERIALIZED (
    SELECT DISTINCT m.account_id FROM public.memberships m JOIN owned USING (workspace_id)
    WHERE m.account_id <> p_owner
  ), addresses AS MATERIALIZED (
    SELECT lower(btrim(u.email)) AS email FROM public.account_identities ai
      JOIN public.auth_user u ON u.id = ai.auth_user_id
    WHERE ai.account_id = p_owner OR ai.account_id IN (SELECT account_id FROM counted)
  ), reserved AS MATERIALIZED (
    SELECT DISTINCT i.email FROM public.workspace_invitations i JOIN owned USING (workspace_id)
    WHERE i.status = 'pending' AND i.expires_at > now()
      AND i.email NOT IN (SELECT email FROM addresses)
  )
  SELECT (SELECT count(*) FROM counted)::integer,
    (SELECT count(*) FROM reserved)::integer,
    (SELECT count(*) FROM (
      SELECT unnest(p_emails) AS email
      EXCEPT SELECT email FROM addresses
      EXCEPT SELECT email FROM reserved
    ) candidates)::integer
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_owner_seat_counts(uuid, text[]) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_require_workspace_collaboration(p_workspace uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  enabled boolean;
BEGIN
  -- Serialize all reservations for this owner, across its workspaces.
  SELECT a.collaboration INTO enabled FROM public.accounts a
    WHERE a.id = public.notesapp_workspace_owner(p_workspace) FOR NO KEY UPDATE;
  IF enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'The workspace owner cannot add members now' USING ERRCODE = 'NA005';
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_workspace_seat_preview(p_workspace uuid, p_emails text[], p_lock boolean)
RETURNS TABLE(member_limit integer, members_used integer, pending_invites integer, additional_places integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  owner_id uuid;
  seat_limit integer;
BEGIN
  IF p_lock OR cardinality(p_emails) > 0 THEN
    IF coalesce(public.notesapp_member_role(p_workspace), '') NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'Member management is required' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.notesapp_is_member(p_workspace) THEN
    RAISE EXCEPTION 'Workspace access is required' USING ERRCODE = '42501';
  END IF;
  IF p_lock THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_workspace::text)::bigint);
    PERFORM public.notesapp_require_workspace_collaboration(p_workspace);
  END IF;
  owner_id := public.notesapp_workspace_owner(p_workspace);
  SELECT a.member_limit INTO seat_limit FROM public.accounts a WHERE a.id = owner_id;
  IF seat_limit IS NULL THEN
    RETURN QUERY SELECT NULL::integer, 0, 0, 0;
  ELSE
    RETURN QUERY SELECT seat_limit, c.* FROM public.notesapp_owner_seat_counts(owner_id, p_emails) c;
  END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_workspace_seat_preview(uuid, text[], boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_workspace_seat_preview(uuid, text[], boolean) TO notesapp_app;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_check_owner_seats(p_workspace uuid, p_emails text[])
RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  owner_id uuid := public.notesapp_workspace_owner(p_workspace);
  seat_limit integer;
  counted record;
BEGIN
  SELECT a.member_limit INTO seat_limit FROM public.accounts a WHERE a.id = owner_id;
  IF seat_limit IS NULL THEN RETURN; END IF;
  SELECT * INTO counted FROM public.notesapp_owner_seat_counts(owner_id, p_emails);
  IF counted.members_used + counted.pending_invites + counted.additional_places > seat_limit THEN
    RAISE EXCEPTION 'The workspace member limit would be exceeded' USING ERRCODE = 'NA006',
      DETAIL = greatest(0, seat_limit - counted.members_used - counted.pending_invites)::text;
  END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_check_owner_seats(uuid, text[]) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_check_workspace_seat_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- The invitation status and membership now reflect the projected count.
    PERFORM public.notesapp_check_owner_seats(NEW.workspace_id, ARRAY[]::text[]);
  ELSE
    PERFORM public.notesapp_require_workspace_collaboration(NEW.workspace_id);
    PERFORM public.notesapp_check_owner_seats(NEW.workspace_id, ARRAY[NEW.email]);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_check_workspace_seat_write() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER workspace_invite_reserve_seat BEFORE INSERT ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.notesapp_check_workspace_seat_write();
--> statement-breakpoint
CREATE TRIGGER workspace_invite_accept_seat AFTER UPDATE OF status ON public.workspace_invitations
  FOR EACH ROW WHEN (OLD.status = 'pending' AND NEW.status = 'accepted')
  EXECUTE FUNCTION public.notesapp_check_workspace_seat_write();
--> statement-breakpoint
CREATE FUNCTION public.notesapp_owner_workspace_memberships(p_owner uuid, p_member uuid)
RETURNS integer
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT count(*)::integer FROM public.memberships owned
    JOIN public.memberships m ON m.workspace_id = owned.workspace_id
  WHERE owned.account_id = p_owner AND owned.role = 'owner'
    AND m.account_id = p_member AND m.role <> 'owner'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_owner_workspace_memberships(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_notify_owner_seats(p_owner uuid)
RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  recipient uuid;
BEGIN
  IF (SELECT member_limit FROM public.accounts WHERE id = p_owner) IS NULL THEN RETURN; END IF;
  FOR recipient IN
    SELECT p_owner UNION
    SELECT m.account_id FROM public.memberships m JOIN public.memberships owned USING (workspace_id)
    WHERE owned.account_id = p_owner AND owned.role = 'owner' AND m.role = 'admin'
  LOOP
    PERFORM pg_notify('notesapp_sync', 'a:' || recipient::text);
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_notify_owner_seats(uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_notify_invite_seats()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.notesapp_notify_owner_seats(public.notesapp_workspace_owner(NEW.workspace_id));
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_notify_invite_seats() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER workspace_invite_notify_seats AFTER INSERT OR UPDATE OF status ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.notesapp_notify_invite_seats();
--> statement-breakpoint
CREATE FUNCTION public.notesapp_lock_membership_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public.accounts a WHERE a.id = public.notesapp_workspace_owner(NEW.workspace_id) FOR NO KEY UPDATE;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_lock_membership_owner() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER memberships_lock_owner BEFORE INSERT ON public.memberships
  FOR EACH ROW WHEN (NEW.role <> 'owner') EXECUTE FUNCTION public.notesapp_lock_membership_owner();
--> statement-breakpoint
CREATE FUNCTION public.notesapp_record_membership_event(
  p_owner uuid, p_member uuid, p_workspace uuid, p_added boolean
)
RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  event_kind public.account_event_kind;
  memberships_left integer;
BEGIN
  IF p_owner IS NULL OR p_owner = p_member THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('notesapp:account-events')::bigint);
  event_kind := CASE WHEN p_added THEN 'workspace_member_added' ELSE 'workspace_member_removed' END;
  memberships_left := public.notesapp_owner_workspace_memberships(p_owner, p_member);
  INSERT INTO public.account_events
    (cursor, account_id, kind, owner_account_id, member_account_id, workspace_id, owner_workspace_memberships)
  SELECT coalesce(max(e.cursor), 0) + 1, p_member, event_kind, p_owner, p_member, p_workspace, memberships_left
  FROM public.account_events e;
  PERFORM public.notesapp_notify_owner_seats(p_owner);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_record_membership_event(uuid, uuid, uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.notesapp_log_member_added()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.notesapp_record_membership_event(
    public.notesapp_workspace_owner(NEW.workspace_id), NEW.account_id, NEW.workspace_id, true);
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_log_member_added() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER memberships_log_add AFTER INSERT ON public.memberships
  FOR EACH ROW WHEN (NEW.role <> 'owner') EXECUTE FUNCTION public.notesapp_log_member_added();
--> statement-breakpoint
CREATE FUNCTION public.notesapp_log_member_removals()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  removed record;
BEGIN
  -- Erasing a workspace deletes its owner row in the same statement.
  FOR removed IN
    SELECT m.workspace_id, m.account_id,
      coalesce(o.account_id, public.notesapp_workspace_owner(m.workspace_id)) AS owner_id
    FROM old_memberships m
    LEFT JOIN old_memberships o ON o.workspace_id = m.workspace_id AND o.role = 'owner'
    WHERE m.role <> 'owner' ORDER BY m.workspace_id, m.account_id
  LOOP
    PERFORM public.notesapp_record_membership_event(
      removed.owner_id, removed.account_id, removed.workspace_id, false);
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_log_member_removals() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER memberships_log_remove AFTER DELETE ON public.memberships
  REFERENCING OLD TABLE AS old_memberships
  FOR EACH STATEMENT EXECUTE FUNCTION public.notesapp_log_member_removals();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.notesapp_workspace_member_page(uuid, uuid, uuid);
--> statement-breakpoint
CREATE FUNCTION public.notesapp_workspace_member_page(p_workspace uuid, p_after uuid, p_member uuid DEFAULT NULL)
RETURNS TABLE(account_id uuid, display_name text, email text, role text, member_count bigint, color_slot integer, owner_workspace_memberships integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.notesapp_is_member(p_workspace) THEN
    RAISE EXCEPTION 'Workspace access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    WITH ordered AS (
      SELECT m.account_id AS id, nullif(u.name, '') AS label, u.email AS address, m.role::text AS access, m.color_slot AS slot,
        row_number() OVER (ORDER BY
          CASE m.role::text WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END,
          lower(coalesce(nullif(u.name, ''), u.email)), m.account_id) AS position
      FROM public.memberships m
      JOIN public.account_identities ai ON ai.account_id = m.account_id
      JOIN public.auth_user u ON u.id = ai.auth_user_id
      WHERE m.workspace_id = p_workspace
    )
    SELECT m.id, m.label, m.address, m.access,
      (SELECT count(*) FROM public.memberships tally WHERE tally.workspace_id = p_workspace), m.slot,
      public.notesapp_owner_workspace_memberships(public.notesapp_workspace_owner(p_workspace), m.id)
    FROM ordered m
    WHERE (p_after IS NULL OR m.position > coalesce((SELECT o.position FROM ordered o WHERE o.id = p_after), 0))
      AND (p_member IS NULL OR m.id = p_member)
    ORDER BY m.position LIMIT 101;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_workspace_member_page(uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_workspace_member_page(uuid, uuid, uuid) TO notesapp_app;
--> statement-breakpoint
CREATE OR REPLACE VIEW public.notesapp_pending_workspace_invites AS
  SELECT i.id, i.workspace_id, w.name AS workspace_name, i.email, i.role::text AS role,
    nullif(u.name, '') AS inviter_name, i.expires_at, a.collaboration AS collaboration_enabled,
    CASE WHEN a.member_limit IS NOT NULL THEN coalesce(nullif(owner_user.name, ''), 'the workspace owner') END AS seat_owner_name
  FROM public.workspace_invitations i JOIN public.workspaces w ON w.id = i.workspace_id
  JOIN public.memberships owner ON owner.workspace_id = w.id AND owner.role = 'owner'
  JOIN public.accounts a ON a.id = owner.account_id
  LEFT JOIN public.account_identities owner_identity ON owner_identity.account_id = owner.account_id
  LEFT JOIN public.auth_user owner_user ON owner_user.id = owner_identity.auth_user_id
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
      SELECT n.id, (n.collaboration IS DISTINCT FROM o.collaboration OR
        n.member_limit IS DISTINCT FROM o.member_limit) AS collaboration_changed
      FROM new_rows n JOIN old_rows o ON o.id = n.id
      WHERE n.state IS DISTINCT FROM o.state
        OR n.removed_at IS DISTINCT FROM o.removed_at
        OR n.controls_revision IS DISTINCT FROM o.controls_revision
        OR n.collaboration IS DISTINCT FROM o.collaboration
        OR n.member_limit IS DISTINCT FROM o.member_limit
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
DROP FUNCTION public.notesapp_operator_account_events(bigint, integer);
--> statement-breakpoint
CREATE FUNCTION public.notesapp_operator_account_events(
		p_after bigint,
		p_limit integer)
	RETURNS TABLE (
		cursor bigint,
		account_id uuid,
		kind text,
		occurred_at timestamptz, owner_account_id uuid, member_account_id uuid,
    workspace_id uuid, owner_workspace_memberships integer)
	LANGUAGE plpgsql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the operator can read the account events'
				USING ERRCODE = '42501';
		END IF;
		RETURN QUERY
		SELECT e.cursor, e.account_id, e.kind::text, e.occurred_at, e.owner_account_id, e.member_account_id,
      e.workspace_id, e.owner_workspace_memberships
		FROM public.account_events e
		WHERE e.cursor > p_after
		ORDER BY e.cursor
		LIMIT greatest(1, least(p_limit, 500));
	END
	$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.notesapp_operator_account_events(bigint, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_operator_account_events(bigint, integer) TO notesapp_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_schema_version() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT 48; $$;
