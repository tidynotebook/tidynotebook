CREATE TABLE "account_themes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"palettes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_themes_name_check" CHECK (char_length("account_themes"."name") between 1 and 60),
	CONSTRAINT "account_themes_palettes_check" CHECK (jsonb_typeof("account_themes"."palettes") = 'object' and ("account_themes"."palettes" ? 'light' or "account_themes"."palettes" ? 'dark') and octet_length("account_themes"."palettes"::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "account_themes" ADD CONSTRAINT "account_themes_account_id_account_preferences_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account_preferences"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_themes_account_idx" ON "account_themes" USING btree ("account_id","created_at");--> statement-breakpoint

-- The themes of an account belong to that account and to nobody else, like
-- its settings (record 0141).
ALTER TABLE public.account_themes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.account_themes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	EXECUTE format(
		'CREATE POLICY account_themes_owner_policy ON public.account_themes '
		'FOR ALL TO %I USING (true) WITH CHECK (true)', current_user
	);
END
$$;--> statement-breakpoint
CREATE POLICY account_themes_member_policy ON public.account_themes
	FOR ALL TO notesapp_app
	USING (account_id = public.notesapp_current_account())
	WITH CHECK (account_id = public.notesapp_current_account());--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.account_themes TO notesapp_app;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the twenty-fourth entry, so the function reports twenty-four.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 24;
$$;
