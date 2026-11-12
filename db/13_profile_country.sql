-- Factureringsland van het lid (ISO 3166-1 alpha-2), gekozen in de checkout.
alter table public.profiles add column if not exists country_code text;
