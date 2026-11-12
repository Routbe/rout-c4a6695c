-- GDPR/AVG: identiteitsdocumenten worden niet langer verzameld of bewaard.
-- Verificatie gebeurt uitsluitend via de SEPA-overschrijving (de bank heeft de
-- identiteitscontrole al gedaan), dus deze tabel en haar inhoud verdwijnen.
drop table if exists public.identity_documents;
