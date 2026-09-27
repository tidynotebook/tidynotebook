CREATE TYPE "public"."report_reason" AS ENUM('phishing', 'malware', 'illegal', 'harassment', 'spam', 'other');--> statement-breakpoint
CREATE TABLE "publication_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" text,
	"sealed_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "publication_reports_note_check" CHECK ("publication_reports"."note" is null or char_length("publication_reports"."note") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "taken_down_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "publication_reports" ADD CONSTRAINT "publication_reports_publication_fk" FOREIGN KEY ("workspace_id","publication_id") REFERENCES "public"."publications"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publication_reports_open_idx" ON "publication_reports" USING btree ("created_at") WHERE "publication_reports"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "publication_reports_publication_idx" ON "publication_reports" USING btree ("workspace_id","publication_id");--> statement-breakpoint

-- The reports of published links and the takedown, from records 0119 and 0123.
--
-- A reader has no account, so a report is one narrow function that the digest
-- of a token buys, like the unlock of a link. An administrator reads and closes
-- the reports and takes a link down through three more functions. Each checks
-- the installation role, and none adds a membership, so an administrator still
-- reads no note of the workspace. The runtime role holds no right on the table.
ALTER TABLE public.publication_reports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.publication_reports FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	EXECUTE format(
		'CREATE POLICY publication_reports_owner_policy ON public.publication_reports '
		'FOR ALL TO %I USING (true) WITH CHECK (true)', current_user
	);
END
$$;--> statement-breakpoint

-- A taken down link never opens again. The runtime role may write the
-- revocation of a link, so the database refuses a change of it once an
-- administrator took the link down.
CREATE FUNCTION public.notesapp_keep_takedown() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		IF OLD.taken_down_at IS NOT NULL
			AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
				OR NEW.taken_down_at IS DISTINCT FROM OLD.taken_down_at) THEN
			RAISE EXCEPTION 'notesapp: a taken down link stays down'
				USING ERRCODE = '42501';
		END IF;
		RETURN NEW;
	END
	$$;--> statement-breakpoint
CREATE TRIGGER publications_keep_takedown
	BEFORE UPDATE ON public.publications
	FOR EACH ROW EXECUTE FUNCTION public.notesapp_keep_takedown();--> statement-breakpoint

-- Stores one report of a link that opens now. A token of no link, of a
-- revoked link or of an expired link stores nothing, and so does a link that
-- already holds 20 open reports. The function answers nothing in every case,
-- so the reader gets one answer.
CREATE FUNCTION public.notesapp_report_publication(
		p_token_digest text,
		p_reason text,
		p_note text,
		p_sealed_address text)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		v_workspace uuid;
		v_publication uuid;
	BEGIN
		SELECT pub.workspace_id, pub.id INTO v_workspace, v_publication
		FROM public.publications pub
		WHERE pub.token_digest = p_token_digest
			AND pub.revoked_at IS NULL
			AND (pub.expires_at IS NULL OR pub.expires_at > now());
		IF v_publication IS NULL THEN
			RETURN;
		END IF;
		IF (SELECT count(*) FROM public.publication_reports r
			WHERE r.workspace_id = v_workspace
				AND r.publication_id = v_publication
				AND r.closed_at IS NULL) >= 20 THEN
			RETURN;
		END IF;
		INSERT INTO public.publication_reports
			(id, workspace_id, publication_id, reason, note, sealed_address)
		VALUES (gen_random_uuid(), v_workspace, v_publication,
			p_reason::public.report_reason, nullif(p_note, ''), p_sealed_address);
	END
	$$;--> statement-breakpoint

-- Every open report, newest first, for an administrator. A row names its link
-- and the state of that link, and no fact of a note or of the workspace.
CREATE FUNCTION public.notesapp_list_reports()
	RETURNS TABLE (
		report_id uuid,
		publication_id uuid,
		reason text,
		note text,
		sealed_address text,
		link_state text,
		created_at timestamptz)
	LANGUAGE plpgsql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		PERFORM public.notesapp_require_administrator();
		RETURN QUERY
		SELECT r.id, r.publication_id, r.reason::text, r.note, r.sealed_address,
			CASE
				WHEN pub.taken_down_at IS NOT NULL THEN 'taken-down'
				WHEN pub.revoked_at IS NOT NULL
					OR (pub.expires_at IS NOT NULL AND pub.expires_at <= now())
					THEN 'stopped'
				ELSE 'live'
			END,
			r.created_at
		FROM public.publication_reports r
		JOIN public.publications pub
			ON pub.workspace_id = r.workspace_id AND pub.id = r.publication_id
		WHERE r.closed_at IS NULL
		ORDER BY r.created_at DESC, r.id
		LIMIT 10000;
	END
	$$;--> statement-breakpoint

-- Closes one open report and keeps its link, for an administrator.
CREATE FUNCTION public.notesapp_dismiss_report(p_report_id uuid)
	RETURNS boolean
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		PERFORM public.notesapp_require_administrator();
		UPDATE public.publication_reports SET closed_at = now()
		WHERE id = p_report_id AND closed_at IS NULL;
		RETURN FOUND;
	END
	$$;--> statement-breakpoint

-- Takes down the link of one open report, for an administrator. The link
-- stops at once and every open report of it closes. A link that its owner
-- already revoked stays as it is. The action goes to the trail of the owner.
CREATE FUNCTION public.notesapp_take_down_publication(p_report_id uuid)
	RETURNS boolean
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		v_workspace uuid;
		v_publication uuid;
		v_owner uuid;
	BEGIN
		PERFORM public.notesapp_require_administrator();
		SELECT r.workspace_id, r.publication_id INTO v_workspace, v_publication
		FROM public.publication_reports r
		WHERE r.id = p_report_id AND r.closed_at IS NULL;
		IF v_publication IS NULL THEN
			RETURN false;
		END IF;
		UPDATE public.publications
		SET revoked_at = now(), taken_down_at = now()
		WHERE workspace_id = v_workspace AND id = v_publication
			AND revoked_at IS NULL
		RETURNING owner_account_id INTO v_owner;
		UPDATE public.publication_reports SET closed_at = now()
		WHERE workspace_id = v_workspace AND publication_id = v_publication
			AND closed_at IS NULL;
		IF v_owner IS NOT NULL THEN
			PERFORM public.notesapp_audit_administration(v_owner, 'take_down_link');
		END IF;
		RETURN true;
	END
	$$;--> statement-breakpoint

-- The retention run keeps a taken down link for 30 days, so its owner sees
-- the takedown (record 0123). A closed report goes after 30 days as well.
CREATE OR REPLACE FUNCTION public.notesapp_cleanup_publications(p_cutoff timestamptz)
	RETURNS TABLE (
		expired_links bigint,
		expired_tickets bigint
	)
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		v_links bigint := 0;
		v_expired bigint := 0;
		v_revoked bigint := 0;
		v_tickets bigint := 0;
		v_kept timestamptz := p_cutoff - interval '30 days';
	BEGIN
		DELETE FROM public.publications WHERE expires_at < p_cutoff
			AND (taken_down_at IS NULL OR taken_down_at < v_kept);
		GET DIAGNOSTICS v_expired = ROW_COUNT;
		DELETE FROM public.publications WHERE revoked_at < p_cutoff
			AND (taken_down_at IS NULL OR taken_down_at < v_kept);
		GET DIAGNOSTICS v_revoked = ROW_COUNT;
		v_links := v_expired + v_revoked;
		DELETE FROM public.reading_tickets WHERE expires_at < p_cutoff;
		GET DIAGNOSTICS v_tickets = ROW_COUNT;
		DELETE FROM public.publication_reports WHERE closed_at < v_kept;
		RETURN QUERY SELECT v_links, v_tickets;
	END;
	$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.notesapp_keep_takedown() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_report_publication(text, text, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_list_reports() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_dismiss_report(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_take_down_publication(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_report_publication(text, text, text, text) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_list_reports() TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_dismiss_report(uuid) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_take_down_publication(uuid) TO notesapp_app;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the sixteenth entry, so the function reports sixteen.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 16;
$$;
