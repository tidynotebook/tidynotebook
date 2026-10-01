CREATE TYPE "public"."legal_document_kind" AS ENUM('text', 'address');--> statement-breakpoint
CREATE TYPE "public"."mail_security" AS ENUM('tls', 'starttls', 'none');--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "mail_host" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "mail_port" integer;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "mail_security" "mail_security";--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "mail_username" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "mail_password_sealed" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "mail_sender" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "terms_kind" "legal_document_kind";--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "terms_text" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "terms_url" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "privacy_kind" "legal_document_kind";--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "privacy_text" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "privacy_url" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "privacy_version" text;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD CONSTRAINT "installation_settings_mail_check" CHECK (("installation_settings"."mail_host" is null and "installation_settings"."mail_port" is null and "installation_settings"."mail_security" is null and "installation_settings"."mail_username" is null and "installation_settings"."mail_password_sealed" is null and "installation_settings"."mail_sender" is null) or coalesce((char_length("installation_settings"."mail_host") between 1 and 253 and "installation_settings"."mail_port" between 1 and 65535 and "installation_settings"."mail_security" is not null and char_length("installation_settings"."mail_sender") between 3 and 320 and ("installation_settings"."mail_username" is null or char_length("installation_settings"."mail_username") between 1 and 320) and ("installation_settings"."mail_password_sealed" is null or "installation_settings"."mail_username" is not null)), false));--> statement-breakpoint
ALTER TABLE "installation_settings" ADD CONSTRAINT "installation_settings_terms_check" CHECK (("installation_settings"."terms_kind" is null and "installation_settings"."terms_text" is null and "installation_settings"."terms_url" is null and "installation_settings"."terms_version" is null) or coalesce((char_length("installation_settings"."terms_version") between 1 and 64 and (("installation_settings"."terms_kind" = 'text' and "installation_settings"."terms_url" is null and octet_length("installation_settings"."terms_text") between 1 and 262144) or ("installation_settings"."terms_kind" = 'address' and "installation_settings"."terms_text" is null and "installation_settings"."terms_url" ~ '^https?://' and char_length("installation_settings"."terms_url") <= 2048))), false));--> statement-breakpoint
ALTER TABLE "installation_settings" ADD CONSTRAINT "installation_settings_privacy_check" CHECK (("installation_settings"."privacy_kind" is null and "installation_settings"."privacy_text" is null and "installation_settings"."privacy_url" is null and "installation_settings"."privacy_version" is null) or coalesce((char_length("installation_settings"."privacy_version") between 1 and 64 and (("installation_settings"."privacy_kind" = 'text' and "installation_settings"."privacy_url" is null and octet_length("installation_settings"."privacy_text") between 1 and 262144) or ("installation_settings"."privacy_kind" = 'address' and "installation_settings"."privacy_text" is null and "installation_settings"."privacy_url" ~ '^https?://' and char_length("installation_settings"."privacy_url") <= 2048))), false));--> statement-breakpoint

-- The mail transport and the legal documents of the installation, from
-- record 0148. The statements above are the ones that `src/schema.ts`
-- generates. The runtime role still holds no right on the table, so the
-- functions below are the one way in, as for the registration policy.
--
-- The server reads the row with no session: a message that a stranger causes
-- and a legal page need it. The password of the mail server is sealed by the
-- server, so this read opens no password.
CREATE FUNCTION public.notesapp_installation_settings()
	RETURNS TABLE (
		mail_host text,
		mail_port integer,
		mail_security text,
		mail_username text,
		mail_password_sealed text,
		mail_sender text,
		terms_kind text,
		terms_text text,
		terms_url text,
		terms_version text,
		privacy_kind text,
		privacy_text text,
		privacy_url text,
		privacy_version text)
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
		SELECT s.mail_host, s.mail_port, s.mail_security::text, s.mail_username,
			s.mail_password_sealed, s.mail_sender,
			s.terms_kind::text, s.terms_text, s.terms_url, s.terms_version,
			s.privacy_kind::text, s.privacy_text, s.privacy_url, s.privacy_version
		FROM public.installation_settings s
	$$;--> statement-breakpoint

-- Sets the mail transport, or removes it when every argument is null, for an
-- administrator. The checks of the table refuse a half transport.
CREATE FUNCTION public.notesapp_set_mail_settings(
		p_host text,
		p_port integer,
		p_security public.mail_security,
		p_username text,
		p_password_sealed text,
		p_sender text)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		PERFORM public.notesapp_lock_installation();
		PERFORM public.notesapp_require_administrator();
		UPDATE public.installation_settings SET
			mail_host = p_host,
			mail_port = p_port,
			mail_security = p_security,
			mail_username = p_username,
			mail_password_sealed = p_password_sealed,
			mail_sender = p_sender,
			updated_at = now();
	END
	$$;--> statement-breakpoint

-- Sets one legal document, or removes it when the kind is null, for an
-- administrator.
CREATE FUNCTION public.notesapp_set_legal_document(
		p_name text,
		p_kind public.legal_document_kind,
		p_text text,
		p_url text,
		p_version text)
	RETURNS void
	LANGUAGE plpgsql
	SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
	BEGIN
		PERFORM public.notesapp_lock_installation();
		PERFORM public.notesapp_require_administrator();
		IF p_name = 'terms' THEN
			UPDATE public.installation_settings SET
				terms_kind = p_kind, terms_text = p_text, terms_url = p_url,
				terms_version = p_version, updated_at = now();
		ELSIF p_name = 'privacy' THEN
			UPDATE public.installation_settings SET
				privacy_kind = p_kind, privacy_text = p_text, privacy_url = p_url,
				privacy_version = p_version, updated_at = now();
		ELSE
			RAISE EXCEPTION 'notesapp: no legal document is named %', p_name
				USING ERRCODE = '22023';
		END IF;
	END
	$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_installation_settings() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_set_mail_settings(text, integer, public.mail_security, text, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.notesapp_set_legal_document(text, public.legal_document_kind, text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_installation_settings() TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_set_mail_settings(text, integer, public.mail_security, text, text, text) TO notesapp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.notesapp_set_legal_document(text, public.legal_document_kind, text, text, text) TO notesapp_app;
