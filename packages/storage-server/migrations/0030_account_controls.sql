CREATE TYPE "public"."account_event_kind" AS ENUM('made', 'verified', 'removed');--> statement-breakpoint
CREATE TYPE "public"."account_standing" AS ENUM('active', 'locked');--> statement-breakpoint
CREATE TABLE "account_events" (
	"cursor" bigint PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "account_event_kind" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_events_cursor_check" CHECK ("account_events"."cursor" > 0)
);
--> statement-breakpoint
CREATE TABLE "account_handoffs" (
	"token_digest" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "account_handoffs_token_digest_check" CHECK ("account_handoffs"."token_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "daily_runs" (
	"job" text PRIMARY KEY NOT NULL,
	"day" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_usage" (
	"month" date NOT NULL,
	"account_id" uuid,
	"published_transfer_bytes" bigint DEFAULT 0 NOT NULL,
	"download_bytes" bigint DEFAULT 0 NOT NULL,
	"object_writes" bigint DEFAULT 0 NOT NULL,
	"object_reads" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "monthly_usage_month_account_unique" UNIQUE NULLS NOT DISTINCT("month","account_id"),
	CONSTRAINT "monthly_usage_month_check" CHECK (extract(day from "monthly_usage"."month") = 1),
	CONSTRAINT "monthly_usage_counts_check" CHECK ("monthly_usage"."published_transfer_bytes" >= 0 and "monthly_usage"."download_bytes" >= 0 and "monthly_usage"."object_writes" >= 0 and "monthly_usage"."object_reads" >= 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "text_limit_bytes" bigint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "published_transfer_limit_bytes" bigint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "download_limit_bytes" bigint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "standing" "account_standing" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "removal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "removal_notices" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "teams" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "collaboration" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "controls_revision" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "text_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_handoffs" ADD CONSTRAINT "account_handoffs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_usage" ADD CONSTRAINT "monthly_usage_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_handoffs_expiry_idx" ON "account_handoffs" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "accounts_removal_idx" ON "accounts" USING btree ("removal_at");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_text_limit_bytes_check" CHECK ("accounts"."text_limit_bytes" is null or "accounts"."text_limit_bytes" > 0);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_published_transfer_limit_bytes_check" CHECK ("accounts"."published_transfer_limit_bytes" is null or "accounts"."published_transfer_limit_bytes" > 0);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_download_limit_bytes_check" CHECK ("accounts"."download_limit_bytes" is null or "accounts"."download_limit_bytes" > 0);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_removal_at_check" CHECK ("accounts"."removal_at" is null or "accounts"."standing" = 'locked');--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_removal_notices_check" CHECK ("accounts"."removal_notices" between 0 and 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_controls_revision_check" CHECK ("accounts"."controls_revision" > 0);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_administrator_active_check" CHECK ("accounts"."installation_role" <> 'administrator' or "accounts"."standing" = 'active');--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD CONSTRAINT "workspace_usage_text_bytes_check" CHECK ("workspace_usage"."text_bytes" >= 0 and "workspace_usage"."text_bytes" <= "workspace_usage"."bytes_used");--> statement-breakpoint

-- The controls of an account, its events, the portal handoff and the totals
-- of a month, from design 024 and records 0189, 0190, 0193 and 0201. The
-- statements above are the ones that `src/schema.ts` generates.
--
-- With no setting of the operator nothing changes: every account is active,
-- has every feature, and has no text, transfer or download limit, so a
-- self-hosted installation needs no action.

-- The text of a workspace is every byte that is not an attachment: the
-- Markdown, the history and the receipts. The bytes of an attachment are the
-- size of its content row, so the split of an earlier release is exact.
UPDATE public.workspace_usage u SET text_bytes = greatest(0, u.bytes_used
	- coalesce((SELECT sum(c.size) FROM public.contents c
		WHERE c.workspace_id = u.workspace_id AND c.kind = 'attachment'), 0));--> statement-breakpoint

-- The events, the handoffs and the totals are reached through the functions
-- below only. The runtime role holds no right on the three tables, and the
-- owner policy is the only policy.
DO $$
DECLARE
	name text;
BEGIN
	FOREACH name IN ARRAY ARRAY['account_events', 'account_handoffs', 'monthly_usage', 'daily_runs'] LOOP
		EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', name);
		EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', name);
		EXECUTE format(
			'CREATE POLICY %I ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',
			name || '_owner_policy', name, current_user);
	END LOOP;
END
$$;--> statement-breakpoint

-- Appends one account event (record 0190). One lock orders every writer and
-- the writer holds it until it commits, so the cursor of an event that commits
-- later is always larger, and a reader that continues after the last cursor
-- that it read misses no event. A caller takes this lock last, after every
-- lock of the one order of record 0112.
CREATE FUNCTION public.notesapp_record_account_event(
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
	$$;--> statement-breakpoint

-- The usage of the owner account of one workspace, its two limits and its
-- standing (records 0112 and 0189). The body of migration 0012, with the text
-- bytes, the text limit and the standing. The return type changes, so the
-- function is made again and its right is given again below.
DROP FUNCTION public.notesapp_add_usage(uuid, bigint);--> statement-breakpoint
DROP FUNCTION public.notesapp_account_usage(uuid);--> statement-breakpoint
CREATE FUNCTION public.notesapp_account_usage(p_workspace_id uuid)
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
			a.standing::text
		FROM public.accounts a WHERE a.id = owner_id;
	END
	$$;--> statement-breakpoint

-- Usage accounting with both limits and the standing of the owner account
-- (records 0112 and 0189). The use case checks first and keeps a reserve for
-- a deletion. This function is the second lock: it refuses every write of a
-- locked owner with `NA004`, and a write past the storage limit or past the
-- text limit with `NA003`, whatever the layers above it do. A delta of text
-- counts toward both sums, and a delta of attachments toward the storage sum
-- alone.
CREATE FUNCTION public.notesapp_add_usage(
		p_workspace_id uuid,
		p_text_delta bigint,
		p_attachment_delta bigint)
	RETURNS bigint
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		updated bigint;
		owned record;
	BEGIN
		IF NOT public.notesapp_is_member(p_workspace_id) THEN
			RAISE EXCEPTION 'notesapp: the account is not a member of this workspace'
				USING ERRCODE = '42501';
		END IF;
		IF p_text_delta < 0 OR p_attachment_delta < 0 THEN
			RAISE EXCEPTION 'notesapp: workspace usage cannot be reduced through this path'
				USING ERRCODE = '23514';
		END IF;
		SELECT * INTO owned FROM public.notesapp_account_usage(p_workspace_id);
		IF owned.standing IS DISTINCT FROM 'active' THEN
			RAISE EXCEPTION 'notesapp: the owner account is locked'
				USING ERRCODE = 'NA004';
		END IF;
		IF owned.used_bytes + p_text_delta + p_attachment_delta > owned.limit_bytes
			OR (owned.text_limit_bytes IS NOT NULL
				AND owned.text_bytes + p_text_delta > owned.text_limit_bytes) THEN
			RAISE EXCEPTION 'notesapp: the owner account has no room left'
				USING ERRCODE = 'NA003';
		END IF;
		UPDATE public.workspace_usage
		SET bytes_used = bytes_used + p_text_delta + p_attachment_delta,
			text_bytes = text_bytes + p_text_delta
		WHERE workspace_id = p_workspace_id
		RETURNING bytes_used INTO updated;
		IF updated IS NULL THEN
			RAISE EXCEPTION 'notesapp: the workspace has no usage record'
				USING ERRCODE = '23503';
		END IF;
		RETURN updated;
	END
	$$;--> statement-breakpoint

-- The body of migration 0007, with the reclaimed bytes split into text and
-- attachments, so the text sum falls with the storage sum. Rights survive a
-- replacement.
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
	IF public.notesapp_member_role(p_workspace_id) IS DISTINCT FROM 'owner' THEN
		RAISE EXCEPTION 'notesapp: only an owner can purge files'
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

-- The account and the standing of a session: an enabled account that is not
-- removed, or no row (record 0111). The actor resolver reads the standing, so
-- a locked account gets an actor that keeps only the list of record 0201.
CREATE FUNCTION public.notesapp_session_standing(p_auth_user_id text)
	RETURNS TABLE (account_id uuid, standing text)
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		SELECT a.id, a.standing::text FROM public.account_identities ai
		JOIN public.accounts a ON a.id = ai.account_id
		WHERE ai.auth_user_id = p_auth_user_id
			AND a.state = 'enabled'
			AND a.removed_at IS NULL
	$$;--> statement-breakpoint

-- The one registration path of record 0108, from migration 0012, with the
-- controls of a new account (record 0189) and its two events (record 0190).
-- The configuration gives the standing of a new account and, for a locked
-- one, how many seconds it lives before the daily run removes it. An account
-- whose address a message proved before the account exists (record 0114) has
-- the event `verified` after `made` in the same transaction. An account of an
-- invitation that went with no mail has `made` alone, and nothing proves its
-- address later.
DROP FUNCTION public.notesapp_register_account(text, text, text, uuid, uuid, text, bigint);--> statement-breakpoint
CREATE FUNCTION public.notesapp_register_account(
		p_auth_user_id text,
		p_ground text,
		p_token_digest text,
		p_account_id uuid,
		p_workspace_id uuid,
		p_workspace_name text,
		p_limit_bytes bigint,
		p_standing public.account_standing,
		p_remove_after_seconds bigint)
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
		IF p_remove_after_seconds IS NOT NULL AND (p_standing IS DISTINCT FROM 'locked'
				OR p_remove_after_seconds <= 0) THEN
			RAISE EXCEPTION 'notesapp: only a locked account has a removal time'
				USING ERRCODE = '22023';
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
				removal_at)
			VALUES (p_account_id, v_role, 'enabled', p_limit_bytes, v_proof,
				CASE WHEN p_ground = 'first-run' THEN 'active' ELSE p_standing END,
				-- A time is kept to the millisecond, which a reader in the
				-- application holds, so a time that it gives back is equal.
				CASE WHEN p_ground = 'first-run' OR p_remove_after_seconds IS NULL
					THEN NULL
					ELSE date_trunc('milliseconds',
						now() + make_interval(secs => p_remove_after_seconds)) END);
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
	$$;--> statement-breakpoint

-- Removes one account and keeps its row as a tombstone (record 0111). The
-- body of migration 0012, with two changes: the operator API and the daily
-- removal run may remove an account too (records 0190 and 0201), and the
-- removal writes its event. The tombstone keeps no control of a locked
-- account, so the daily run never reads it again.
CREATE OR REPLACE FUNCTION public.notesapp_remove_account(p_account_id uuid)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		target record;
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
		PERFORM public.notesapp_lock_account(p_account_id);
		FOR held IN
			SELECT m.workspace_id, m.role FROM public.memberships m
			WHERE m.account_id = p_account_id ORDER BY m.workspace_id
		LOOP
			IF held.role = 'owner' THEN
				PERFORM public.notesapp_erase_workspace(held.workspace_id);
			ELSE
				DELETE FROM public.memberships
				WHERE workspace_id = held.workspace_id AND account_id = p_account_id;
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
	$$;--> statement-breakpoint

-- Every account that is not removed, for an administrator, with its controls
-- (records 0109 and 0189). The body of migration 0012 with more columns, so
-- the function is made again and its right is given again below.
DROP FUNCTION public.notesapp_list_accounts();--> statement-breakpoint
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
		controls_revision bigint)
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
			a.standing::text,
			a.removal_at,
			a.text_limit_bytes,
			a.published_transfer_limit_bytes,
			a.download_limit_bytes,
			a.teams,
			a.collaboration,
			a.controls_revision
		FROM public.accounts a
		LEFT JOIN public.account_identities ai ON ai.account_id = a.id
		LEFT JOIN public.auth_user u ON u.id = ai.auth_user_id
		WHERE a.removed_at IS NULL
		ORDER BY a.created_at, a.id;
	END
	$$;--> statement-breakpoint

-- Changes the byte limit of one account, for an administrator. The body of
-- migration 0012, and the limit is a control now, so its revision rises.
CREATE OR REPLACE FUNCTION public.notesapp_set_account_limit(
		p_account_id uuid,
		p_limit_bytes bigint)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		PERFORM public.notesapp_lock_installation();
		PERFORM public.notesapp_require_administrator();
		PERFORM public.notesapp_lock_account(p_account_id);
		UPDATE public.accounts SET limit_bytes = p_limit_bytes,
			controls_revision = controls_revision + 1
		WHERE id = p_account_id AND removed_at IS NULL;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'notesapp: no such account' USING ERRCODE = 'P0002';
		END IF;
		PERFORM public.notesapp_audit_administration(p_account_id,
			'installation.limit');
	END
	$$;--> statement-breakpoint

-- Writes every control of one account, for an administrator or for the
-- operator API (records 0189 and 0190). The write names the revision that it
-- read, and the answer is `changed` with nothing written when the stored
-- revision differs, so a write that was made from an old state cannot replace
-- a newer one. The answer is `missing` for no account. A new removal time
-- sets the count of its notices back to zero. The check of the table holds
-- that only a locked account has a removal time.
CREATE FUNCTION public.notesapp_set_account_controls(
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
	$$;--> statement-breakpoint

-- The hint of record 0129 for a change of the state, the removal or the
-- controls of an account. The body of migration 0020, with the revision of
-- the controls, so an open stream checks its account again (record 0189).
CREATE OR REPLACE FUNCTION public.notesapp_notify_account_changed()
	RETURNS trigger
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		changed uuid;
	BEGIN
		FOR changed IN
			SELECT DISTINCT n.id FROM new_rows n
			JOIN old_rows o ON o.id = n.id
			WHERE n.state IS DISTINCT FROM o.state
				OR n.removed_at IS DISTINCT FROM o.removed_at
				OR n.controls_revision IS DISTINCT FROM o.controls_revision
			ORDER BY 1
		LOOP
			PERFORM pg_notify('notesapp_sync', 'a:' || changed::text);
		END LOOP;
		RETURN NULL;
	END
	$$;--> statement-breakpoint

-- The one row of a published link, from migration 0004. A link in a
-- workspace whose owner is locked opens nothing, whoever made the link, so its reader path answers the closed page of
-- record 0146 for each of its links, and the link comes back once the
-- account is active again (record 0201). Rights survive a replacement.
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
			AND a.standing = 'active';
	END;
	$$;--> statement-breakpoint

-- The account of one address, for the operator API, or null (record 0190).
CREATE FUNCTION public.notesapp_operator_find_account(p_email text)
	RETURNS uuid
	LANGUAGE plpgsql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		found_id uuid;
	BEGIN
		IF NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the operator can find an account'
				USING ERRCODE = '42501';
		END IF;
		SELECT a.id INTO found_id FROM public.auth_user u
		JOIN public.account_identities ai ON ai.auth_user_id = u.id
		JOIN public.accounts a ON a.id = ai.account_id
		WHERE lower(u.email) = lower(p_email) AND a.removed_at IS NULL;
		RETURN found_id;
	END
	$$;--> statement-breakpoint

-- One account with its controls and its usage, for an administrator or for
-- the operator API, or no row (records 0189, 0190 and 0193). The month names
-- the totals of transfer that the answer holds. It reads no note.
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
			a.created_at, a.standing::text,
			a.removal_at, a.limit_bytes, a.text_limit_bytes,
			a.published_transfer_limit_bytes, a.download_limit_bytes,
			a.teams, a.collaboration, a.controls_revision,
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
	$$;--> statement-breakpoint

-- The totals of the installation for one month, for the operator API (record
-- 0193). A month with no row answers zero for each total.
CREATE FUNCTION public.notesapp_operator_totals(p_month date)
	RETURNS TABLE (
		published_transfer_bytes bigint,
		download_bytes bigint,
		object_writes bigint,
		object_reads bigint)
	LANGUAGE plpgsql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the operator can read the totals'
				USING ERRCODE = '42501';
		END IF;
		RETURN QUERY
		SELECT coalesce(max(mu.published_transfer_bytes), 0)::bigint,
			coalesce(max(mu.download_bytes), 0)::bigint,
			coalesce(max(mu.object_writes), 0)::bigint,
			coalesce(max(mu.object_reads), 0)::bigint
		FROM public.monthly_usage mu
		WHERE mu.month = p_month AND mu.account_id IS NULL;
	END
	$$;--> statement-breakpoint

-- The account events after a cursor, oldest first, for the operator API
-- (record 0190).
CREATE FUNCTION public.notesapp_operator_account_events(
		p_after bigint,
		p_limit integer)
	RETURNS TABLE (
		cursor bigint,
		account_id uuid,
		kind text,
		occurred_at timestamptz)
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
		SELECT e.cursor, e.account_id, e.kind::text, e.occurred_at
		FROM public.account_events e
		WHERE e.cursor > p_after
		ORDER BY e.cursor
		LIMIT greatest(1, least(p_limit, 500));
	END
	$$;--> statement-breakpoint

-- Stores the digest of one portal handoff of the account of the transaction
-- and answers when it expires (record 0190). It lives 60 seconds and works
-- once. Each call removes every handoff that expired, through the expiry
-- index, so the table holds only the handoffs of the last minute. A locked
-- account opens a handoff too, because the portal is the way to unlock it
-- (record 0201).
CREATE FUNCTION public.notesapp_open_handoff(p_token_digest text)
	RETURNS timestamptz
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		caller uuid := public.notesapp_current_account();
		expiry timestamptz := now() + interval '60 seconds';
	BEGIN
		IF caller IS NULL OR NOT EXISTS (
			SELECT 1 FROM public.accounts a
			WHERE a.id = caller AND a.state = 'enabled' AND a.removed_at IS NULL
		) THEN
			RAISE EXCEPTION 'notesapp: only an enabled account opens the portal'
				USING ERRCODE = '42501';
		END IF;
		DELETE FROM public.account_handoffs WHERE expires_at <= now();
		INSERT INTO public.account_handoffs (token_digest, account_id, expires_at)
			VALUES (p_token_digest, caller, expiry);
		RETURN expiry;
	END
	$$;--> statement-breakpoint

-- Redeems one portal handoff for the operator API (record 0190): the account
-- and its address, or no row for a used, an expired and an unknown token
-- alike. The update marks it used in the same statement, so two redeems of
-- one token give one answer.
CREATE FUNCTION public.notesapp_redeem_handoff(p_token_digest text)
	RETURNS TABLE (account_id uuid, email text)
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the operator can redeem a handoff'
				USING ERRCODE = '42501';
		END IF;
		RETURN QUERY
		WITH redeemed AS (
			UPDATE public.account_handoffs h SET used_at = now()
			WHERE h.token_digest = p_token_digest
				AND h.used_at IS NULL
				AND h.expires_at > now()
			RETURNING h.account_id
		)
		SELECT a.id, u.email FROM redeemed r
		JOIN public.accounts a ON a.id = r.account_id AND a.removed_at IS NULL
		LEFT JOIN public.account_identities ai ON ai.account_id = a.id
		LEFT JOIN public.auth_user u ON u.id = ai.auth_user_id;
	END
	$$;--> statement-breakpoint

-- The locked accounts whose removal time comes before a horizon, for the
-- daily removal run (record 0201), with the address of each and the count of
-- the notices that went.
CREATE FUNCTION public.notesapp_removal_candidates(p_horizon timestamptz)
	RETURNS TABLE (
		account_id uuid,
		email text,
		removal_at timestamptz,
		removal_notices integer)
	LANGUAGE plpgsql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the operator reads the removals'
				USING ERRCODE = '42501';
		END IF;
		RETURN QUERY
		SELECT a.id, u.email, a.removal_at, a.removal_notices
		FROM public.accounts a
		LEFT JOIN public.account_identities ai ON ai.account_id = a.id
		LEFT JOIN public.auth_user u ON u.id = ai.auth_user_id
		WHERE a.standing = 'locked'
			AND a.removal_at IS NOT NULL
			AND a.removal_at <= p_horizon
			AND a.removed_at IS NULL
		ORDER BY a.removal_at, a.id;
	END
	$$;--> statement-breakpoint

-- Removes one account whose removal time has passed, for the daily run
-- (record 0201). It reads the standing and the time again under the
-- installation lock, so an account that became active in the meantime, or
-- whose time moved, stays. The answer states whether it went.
CREATE FUNCTION public.notesapp_remove_due_account(p_account_id uuid)
	RETURNS boolean
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the operator removes an account that is due'
				USING ERRCODE = '42501';
		END IF;
		PERFORM public.notesapp_lock_installation();
		IF NOT EXISTS (
			SELECT 1 FROM public.accounts a
			WHERE a.id = p_account_id
				AND a.standing = 'locked'
				AND a.removal_at IS NOT NULL
				AND a.removal_at <= now()
				AND a.removed_at IS NULL
		) THEN
			RETURN false;
		END IF;
		PERFORM public.notesapp_remove_account(p_account_id);
		RETURN true;
	END
	$$;--> statement-breakpoint

-- Claims one notice before the removal (record 0201), only while the
-- removal time is the one that the notice names and the notice did not go,
-- and answers whether this call claimed it. The run claims a notice before it
-- sends the mail, so two runs never send one notice twice.
CREATE FUNCTION public.notesapp_mark_removal_notice(
		p_account_id uuid,
		p_notices integer,
		p_removal_at timestamptz)
	RETURNS boolean
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the operator records a notice'
				USING ERRCODE = '42501';
		END IF;
		UPDATE public.accounts SET removal_notices = p_notices
		WHERE id = p_account_id
			AND standing = 'locked'
			AND removal_at = p_removal_at
			AND removal_notices < p_notices
			AND removed_at IS NULL;
		RETURN FOUND;
	END
	$$;--> statement-breakpoint

-- Gives back a notice that a run claimed and whose mail did not go, so the
-- next run sends it. It moves the count back only from the claimed value.
CREATE FUNCTION public.notesapp_release_removal_notice(
		p_account_id uuid,
		p_notices integer,
		p_removal_at timestamptz)
	RETURNS boolean
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the operator releases a notice'
				USING ERRCODE = '42501';
		END IF;
		UPDATE public.accounts SET removal_notices = p_notices - 1
		WHERE id = p_account_id
			AND removal_at = p_removal_at
			AND removal_notices = p_notices
			AND removed_at IS NULL;
		RETURN FOUND;
	END
	$$;--> statement-breakpoint

-- Whether a write may reach one workspace: its owner is active (records 0189
-- and 0201). A workspace with no owner yet is being made, and the function
-- that makes it checks the account that makes it. It answers one fact and no
-- data of the workspace.
CREATE FUNCTION public.notesapp_workspace_writable(p_workspace_id uuid)
	RETURNS boolean
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		SELECT coalesce((
			SELECT a.standing = 'active' FROM public.accounts a
			WHERE a.id = public.notesapp_workspace_owner(p_workspace_id)
		), true)
	$$;--> statement-breakpoint

-- Whether a write may reach one account: the account is active.
CREATE FUNCTION public.notesapp_account_writable(p_account_id uuid)
	RETURNS boolean
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		SELECT coalesce((
			SELECT a.standing = 'active' FROM public.accounts a
			WHERE a.id = p_account_id
		), true)
	$$;--> statement-breakpoint

-- Refuses a write of the runtime role to a workspace whose owner is locked,
-- or to an account that is locked, with NA004 (records 0189 and 0201).
--
-- The first argument names the column that holds the workspace or the
-- account, and the second names which of the two it is. The function is not
-- a security definer on purpose: `current_user` is then the role of the
-- statement. A write that a function of the schema owner makes, such as the
-- removal of record 0111, passes here, and each such function that a locked
-- account could reach checks the standing itself.
CREATE FUNCTION public.notesapp_guard_locked_write()
	RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		written jsonb;
		target uuid;
	BEGIN
		IF current_user IS DISTINCT FROM 'notesapp_app' THEN
			IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
			RETURN NEW;
		END IF;
		IF TG_OP = 'DELETE' THEN
			written := to_jsonb(OLD);
		ELSE
			written := to_jsonb(NEW);
		END IF;
		target := (written ->> TG_ARGV[0])::uuid;
		IF (TG_ARGV[1] = 'account' AND NOT public.notesapp_account_writable(target))
			OR (TG_ARGV[1] = 'workspace'
				AND NOT public.notesapp_workspace_writable(target)) THEN
			RAISE EXCEPTION 'notesapp: the owner account is locked'
				USING ERRCODE = 'NA004';
		END IF;
		IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
		RETURN NEW;
	END
	$$;--> statement-breakpoint

-- One guard on each table that the runtime role writes and that belongs to
-- a workspace or to an account. The consents, the audit trail and the
-- tables of the identity role stay open, because a locked account keeps its
-- consent and its sessions (record 0201).
DO $$
DECLARE
	guarded record;
BEGIN
	FOR guarded IN
		SELECT * FROM (VALUES
			('workspaces', 'id', 'workspace'),
			('memberships', 'workspace_id', 'workspace'),
			('files', 'workspace_id', 'workspace'),
			('live_paths', 'workspace_id', 'workspace'),
			('contents', 'workspace_id', 'workspace'),
			('revisions', 'workspace_id', 'workspace'),
			('revision_parents', 'workspace_id', 'workspace'),
			('changesets', 'workspace_id', 'workspace'),
			('mutation_receipts', 'workspace_id', 'workspace'),
			('purge_markers', 'workspace_id', 'workspace'),
			('sync_changes', 'workspace_id', 'workspace'),
			('snapshots', 'workspace_id', 'workspace'),
			('snapshot_items', 'workspace_id', 'workspace'),
			('search_index', 'workspace_id', 'workspace'),
			('note_links', 'workspace_id', 'workspace'),
			('note_documents', 'workspace_id', 'workspace'),
			('attachment_objects', 'workspace_id', 'workspace'),
			('publications', 'workspace_id', 'workspace'),
			('reading_tickets', 'workspace_id', 'workspace'),
			('daily_note_settings', 'workspace_id', 'workspace'),
			('template_settings', 'workspace_id', 'workspace'),
			('account_preferences', 'account_id', 'account'),
			('account_themes', 'account_id', 'account')
		) AS t(table_name, key_column, scope)
	LOOP
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
			'FOR EACH ROW EXECUTE FUNCTION public.notesapp_guard_locked_write(%L, %L)',
			guarded.table_name || '_locked_guard', guarded.table_name,
			guarded.key_column, guarded.scope);
	END LOOP;
END
$$;--> statement-breakpoint

-- Refuses a write of a function of the schema owner that a locked account
-- could reach, by the standing of the owner of the workspace.
CREATE FUNCTION public.notesapp_require_writable(p_workspace_id uuid)
	RETURNS void
	LANGUAGE plpgsql
	STABLE
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF NOT public.notesapp_workspace_writable(p_workspace_id) THEN
			RAISE EXCEPTION 'notesapp: the owner account is locked'
				USING ERRCODE = 'NA004';
		END IF;
	END
	$$;--> statement-breakpoint

-- The cursor of a workspace, from migration 0000, which every write of the
-- feed allocates. A workspace whose owner is locked allocates none.
CREATE OR REPLACE FUNCTION public.notesapp_next_cursor(p_workspace_id uuid) RETURNS bigint
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		allocated bigint;
	BEGIN
		IF NOT public.notesapp_is_member(p_workspace_id) THEN
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
	$$;--> statement-breakpoint

-- The deletion of one workspace, from migration 0012. A locked owner deletes
-- no workspace: its removal of record 0111 takes every workspace instead.
CREATE OR REPLACE FUNCTION public.notesapp_delete_workspace(p_workspace_id uuid)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		caller uuid := public.notesapp_current_account();
		held integer;
	BEGIN
		-- A null role is not the owner role either, so the comparison has to be
		-- `IS DISTINCT FROM` and not `<>`.
		IF public.notesapp_member_role(p_workspace_id) IS DISTINCT FROM 'owner' THEN
			RAISE EXCEPTION 'notesapp: only an owner can delete a workspace'
				USING ERRCODE = '42501';
		END IF;
		PERFORM public.notesapp_require_writable(p_workspace_id);
		SELECT count(*) INTO held FROM public.memberships m
			WHERE m.account_id = caller;
		IF held <= 1 THEN
			RAISE EXCEPTION 'notesapp: an account keeps its last workspace'
				USING ERRCODE = '42501';
		END IF;
		PERFORM public.notesapp_erase_workspace(p_workspace_id);
	END
	$$;--> statement-breakpoint

-- The creation of a workspace, from migration 0012. A locked account makes
-- no workspace.
CREATE OR REPLACE FUNCTION public.notesapp_create_workspace(
		p_workspace_id uuid,
		p_name text)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		creator uuid := public.notesapp_current_account();
	BEGIN
		IF creator IS NULL THEN
			RAISE EXCEPTION 'notesapp: the transaction has no account identity'
				USING ERRCODE = '42501';
		END IF;
		IF NOT public.notesapp_account_writable(creator) THEN
			RAISE EXCEPTION 'notesapp: the account is locked'
				USING ERRCODE = 'NA004';
		END IF;
		PERFORM public.notesapp_lock_account(creator);
		INSERT INTO public.workspaces (id, name, personal)
			VALUES (p_workspace_id, p_name, false);
		INSERT INTO public.workspace_usage (workspace_id, bytes_used)
			VALUES (p_workspace_id, 0);
		INSERT INTO public.workspace_cursors (workspace_id, last_cursor)
			VALUES (p_workspace_id, 0);
		INSERT INTO public.memberships (workspace_id, account_id, role)
			VALUES (p_workspace_id, creator, 'owner');
	END
	$$;--> statement-breakpoint

-- Changes the installation role of one account, from migration 0012. The
-- role decides which controls fit the account, so a change of it raises the
-- revision of the controls, and a write of them that read the old role
-- changes nothing. The table refuses a locked administrator.
CREATE OR REPLACE FUNCTION public.notesapp_set_installation_role(
		p_account_id uuid,
		p_role public.installation_role)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		v_state public.account_state;
	BEGIN
		PERFORM public.notesapp_lock_installation();
		PERFORM public.notesapp_require_administrator();
		SELECT a.state INTO v_state FROM public.accounts a
		WHERE a.id = p_account_id AND a.removed_at IS NULL;
		IF v_state IS NULL THEN
			RAISE EXCEPTION 'notesapp: no such account' USING ERRCODE = 'P0002';
		END IF;
		PERFORM public.notesapp_keep_administrator(p_account_id, p_role,
			v_state, false);
		UPDATE public.accounts SET installation_role = p_role,
			controls_revision = controls_revision + 1
		WHERE id = p_account_id;
		PERFORM public.notesapp_audit_administration(p_account_id,
			'installation.role');
	END
	$$;--> statement-breakpoint

-- Makes one account an enabled administrator, for `pnpm account:promote`,
-- from migration 0012. An administrator is always active, so a promotion of
-- a locked account makes it active and takes its removal time away: the
-- command is the way back into an installation, and it must work.
CREATE OR REPLACE FUNCTION public.notesapp_operator_promote(p_email text)
	RETURNS uuid
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		target uuid;
	BEGIN
		IF NOT public.notesapp_is_operator() THEN
			RAISE EXCEPTION 'notesapp: only the operator command can promote'
				USING ERRCODE = '42501';
		END IF;
		PERFORM public.notesapp_lock_installation();
		SELECT ai.account_id INTO target FROM public.auth_user u
		JOIN public.account_identities ai ON ai.auth_user_id = u.id
		WHERE lower(u.email) = lower(p_email);
		IF target IS NULL THEN
			RETURN NULL;
		END IF;
		UPDATE public.accounts SET installation_role = 'administrator',
			state = 'enabled', standing = 'active', removal_at = NULL,
			removal_notices = 0, controls_revision = controls_revision + 1
		WHERE id = target AND removed_at IS NULL;
		INSERT INTO public.account_audit_events
			(id, account_id, action, target_kind, target_id)
		VALUES (gen_random_uuid(), target, 'installation.promote', 'operator', NULL);
		RETURN target;
	END
	$$;--> statement-breakpoint

-- Claims the run of one daily job for one day in UTC, and answers whether
-- this call claimed it (record 0201). Every process of the installation asks
-- before it runs the job, so the job runs once a day whatever the count of
-- processes, and a later day claims it again.
CREATE FUNCTION public.notesapp_claim_daily_run(p_job text, p_day date)
	RETURNS boolean
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		claimed text;
	BEGIN
		INSERT INTO public.daily_runs (job, day) VALUES (p_job, p_day)
		ON CONFLICT (job) DO UPDATE SET day = excluded.day
			WHERE daily_runs.day < excluded.day
		RETURNING daily_runs.job INTO claimed;
		RETURN claimed IS NOT NULL;
	END
	$$;--> statement-breakpoint

-- Function rights. The event writer stays with the schema owner, so an event
-- comes only from a function above.
REVOKE ALL ON FUNCTION public.notesapp_record_account_event(uuid, public.account_event_kind) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_account_usage(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_add_usage(uuid, bigint, bigint) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_session_standing(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_register_account(text, text, text, uuid, uuid, text, bigint, public.account_standing, bigint) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_list_accounts() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_set_account_controls(uuid, bigint, public.account_standing, timestamptz, bigint, bigint, bigint, bigint, boolean, boolean) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_operator_find_account(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_account_controls(uuid, date) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_operator_totals(date) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_operator_account_events(bigint, integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_open_handoff(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_redeem_handoff(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_removal_candidates(timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_remove_due_account(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_mark_removal_notice(uuid, integer, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_release_removal_notice(uuid, integer, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_workspace_writable(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_account_writable(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_guard_locked_write() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_require_writable(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_claim_daily_run(text, date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_account_usage(uuid) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_add_usage(uuid, bigint, bigint) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_session_standing(text) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_register_account(text, text, text, uuid, uuid, text, bigint, public.account_standing, bigint) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_list_accounts() TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_set_account_controls(uuid, bigint, public.account_standing, timestamptz, bigint, bigint, bigint, bigint, boolean, boolean) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_operator_find_account(text) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_account_controls(uuid, date) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_operator_totals(date) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_operator_account_events(bigint, integer) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_open_handoff(text) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_redeem_handoff(text) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_removal_candidates(timestamptz) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_remove_due_account(uuid) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_mark_removal_notice(uuid, integer, timestamptz) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_release_removal_notice(uuid, integer, timestamptz) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_workspace_writable(uuid) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_account_writable(uuid) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_guard_locked_write() TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_require_writable(uuid) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_claim_daily_run(text, date) TO notesapp_app;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the thirty-first entry, so the function reports thirty-one.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 31;
$$;
