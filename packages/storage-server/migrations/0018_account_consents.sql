CREATE TABLE "account_consents" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_consents" ADD CONSTRAINT "account_consents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- The consent of an account belongs to that account and to nobody else,
-- like its settings (record 0120).
ALTER TABLE public.account_consents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.account_consents FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	EXECUTE format(
		'CREATE POLICY account_consents_owner_policy ON public.account_consents '
		'FOR ALL TO %I USING (true) WITH CHECK (true)', current_user
	);
END
$$;--> statement-breakpoint
CREATE POLICY account_consents_member_policy ON public.account_consents
	FOR ALL TO notesapp_app
	USING (account_id = public.notesapp_current_account())
	WITH CHECK (account_id = public.notesapp_current_account());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.account_consents TO notesapp_app;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the nineteenth entry, so the function reports nineteen.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 19;
$$;
