-- The unit of work of the store sends its feed hints after its commit, from
-- record 0142. In a transaction that sets `notesapp.defer_hints`, the trigger
-- marks the changed workspaces in `notesapp.sync_hints` and queues no
-- notification, so the commit takes no notification lock. Every other writer
-- still queues its hint here, as record 0125 states. A mark is a setting of
-- the transaction, so a rollback and a savepoint rollback take it back.
CREATE OR REPLACE FUNCTION public.notesapp_notify_sync_changes()
	RETURNS trigger
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	DECLARE
		changed uuid;
		marked text;
	BEGIN
		IF coalesce(current_setting('notesapp.defer_hints', true), '') = 'on' THEN
			SELECT string_agg(DISTINCT id, ',' ORDER BY id) INTO marked
			FROM (
				SELECT i.workspace_id::text AS id FROM inserted i
				UNION
				SELECT unnest(string_to_array(
					nullif(current_setting('notesapp.sync_hints', true), ''), ','))
			) AS ids;
			PERFORM set_config('notesapp.sync_hints', coalesce(marked, ''), true);
			RETURN NULL;
		END IF;
		FOR changed IN
			SELECT DISTINCT i.workspace_id FROM inserted i ORDER BY 1
		LOOP
			PERFORM pg_notify('notesapp_sync', 'w:' || changed::text);
		END LOOP;
		RETURN NULL;
	END
	$$;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the twenty-fifth entry, so the function reports twenty-five.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 25;
$$;
