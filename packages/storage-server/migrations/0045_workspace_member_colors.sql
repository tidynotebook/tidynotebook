ALTER TABLE "memberships" ADD COLUMN "color_slot" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
WITH ranked AS (
  SELECT workspace_id, account_id, row_number() OVER (
    PARTITION BY workspace_id ORDER BY (role = 'owner') DESC, created_at, account_id
  ) - 1 AS slot
  FROM public.memberships
)
UPDATE public.memberships AS member SET color_slot = ranked.slot
FROM ranked
WHERE member.workspace_id = ranked.workspace_id AND member.account_id = ranked.account_id;
--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_color_slot_idx" ON "memberships" USING btree ("workspace_id","color_slot");
--> statement-breakpoint
CREATE FUNCTION public.notesapp_assign_member_color() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.workspace_id::text)::bigint);
  SELECT min(candidate.slot) INTO NEW.color_slot
  FROM (
    SELECT 0 AS slot
    UNION ALL SELECT color_slot + 1 FROM public.memberships WHERE workspace_id = NEW.workspace_id
  ) candidate
  WHERE NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = NEW.workspace_id AND color_slot = candidate.slot
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_assign_member_color() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER memberships_assign_color BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.notesapp_assign_member_color();
--> statement-breakpoint
CREATE FUNCTION public.notesapp_current_member_color(p_workspace uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT color_slot FROM public.memberships
  WHERE workspace_id = p_workspace AND account_id = public.notesapp_current_account()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_current_member_color(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_current_member_color(uuid) TO notesapp_app;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.notesapp_workspace_member_page(uuid, uuid, uuid);
--> statement-breakpoint
CREATE FUNCTION public.notesapp_workspace_member_page(p_workspace uuid, p_after uuid, p_member uuid DEFAULT NULL)
RETURNS TABLE(account_id uuid, display_name text, email text, role text, member_count bigint, color_slot integer)
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
      (SELECT count(*) FROM public.memberships tally WHERE tally.workspace_id = p_workspace), m.slot
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
DROP FUNCTION IF EXISTS public.notesapp_revision_contributors(uuid, uuid[]);
--> statement-breakpoint
CREATE FUNCTION public.notesapp_revision_contributors(p_workspace uuid, p_revisions uuid[])
RETURNS TABLE(revision_id uuid, account_id uuid, display_name text, former_member boolean, color_slot integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.notesapp_is_member(p_workspace) THEN
    RAISE EXCEPTION 'Workspace access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT r.id, m.account_id, nullif(u.name, ''), m.account_id IS NULL, m.color_slot
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
CREATE OR REPLACE FUNCTION public.notesapp_schema_version() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT 46; $$;
