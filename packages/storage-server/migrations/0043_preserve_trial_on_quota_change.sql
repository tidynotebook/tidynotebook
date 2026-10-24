-- A quota-only administrator change does not grant account access. Only an
-- explicit revision-checked controls write or administrator promotion ends
-- a trial. Keep this independent of whether the expiry sweep ran first.
CREATE OR REPLACE FUNCTION public.notesapp_end_admin_trial() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 IF NEW.trial_ends_at IS NOT NULL AND NEW.installation_role = 'administrator' THEN
   NEW.trial_ended_at := coalesce(NEW.trial_ended_at, clock_timestamp());
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notesapp_schema_version() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT 44; $$;
