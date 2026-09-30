DROP INDEX "search_index_document_idx";--> statement-breakpoint
ALTER TABLE "search_index" ADD COLUMN "document" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', body), 'B')) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "search_index_document_idx" ON "search_index" USING gin ("workspace_id","document");
--> statement-breakpoint
-- Search reads the stored vector of a note (issue 207). The function before
-- this one built the vector of every match from its text for the recheck,
-- the rank and the title test, and it built an excerpt for every match
-- before it cut the page.
CREATE OR REPLACE FUNCTION public.notesapp_search(
  p_workspace_id uuid,
  p_query text,
  p_limit integer
)
RETURNS TABLE (
  file_id uuid,
  path text,
  revision_id uuid,
  excerpt text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET client_min_messages = warning
AS $$
DECLARE
  terms text[];
  term text;
  part tsquery;
  needle tsquery := NULL;
  at integer;
  total integer;
BEGIN
  IF NOT public.notesapp_is_member(p_workspace_id) THEN
    RETURN;
  END IF;

  terms := ARRAY(
    SELECT left(word, 64)
      FROM unnest(
             regexp_split_to_array(lower(coalesce(p_query, '')), '[^[:alnum:]]+')
           ) AS word
     WHERE word <> ''
     LIMIT 16
  );
  total := coalesce(array_length(terms, 1), 0);
  IF total = 0 THEN
    RETURN;
  END IF;

  FOR at IN 1..total LOOP
    term := terms[at];
    part := plainto_tsquery('english', term);
    IF at = total THEN
      -- The word the person may still be typing also matches as a prefix.
      -- The `simple` configuration keeps the word itself, so the prefix of a
      -- stop word such as `not` still reaches the stemmed lexeme `note`.
      IF part::text = '' THEN
        part := to_tsquery('simple', term || ':*');
      ELSE
        part := part || to_tsquery('simple', term || ':*');
      END IF;
    END IF;
    IF part::text <> '' THEN
      needle := CASE WHEN needle IS NULL THEN part ELSE needle && part END;
    END IF;
  END LOOP;

  IF needle IS NULL THEN
    RETURN;
  END IF;

  -- The page is ranked and cut first, and only its rows build an excerpt.
  -- The match, the rank and the title test read the stored vector, so no
  -- row parses its text again.
  RETURN QUERY
    WITH page AS MATERIALIZED (
      SELECT indexed.file_id,
             indexed.path,
             indexed.body,
             indexed.revision_id,
             ts_filter(indexed.document, '{a}') @@ needle AS named,
             ts_rank_cd(
               '{0.1, 0.2, 0.4, 1.0}'::float4[],
               indexed.document,
               needle
             ) AS rank
        FROM public.search_index indexed
       WHERE indexed.workspace_id = p_workspace_id
         AND indexed.document @@ needle
       ORDER BY named DESC, rank DESC, indexed.path, indexed.file_id
       LIMIT least(greatest(coalesce(p_limit, 1), 1), 100)
    )
    SELECT page.file_id,
           page.path,
           page.revision_id,
           ts_headline(
             'english',
             translate(page.body, chr(1) || chr(2), ''),
             needle,
             'StartSel="' || chr(1) || '", StopSel="' || chr(2) || '",'
               || ' MaxWords=28, MinWords=10, ShortWord=2, MaxFragments=2,'
               || ' FragmentDelimiter=" ... "'
           ) AS excerpt
      FROM page
     ORDER BY page.named DESC, page.rank DESC, page.path, page.file_id;
END
$$;--> statement-breakpoint

-- The schema version is the number of entries in the migration journal. This
-- migration is the twenty-third entry, so the function reports twenty-three.
CREATE OR REPLACE FUNCTION public.notesapp_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 23;
$$;
