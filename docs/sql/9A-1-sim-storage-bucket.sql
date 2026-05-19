-- docs/sql/9A-1-sim-storage-bucket.sql
-- Etape 9A-1 : creation du bucket Storage prive pour le module SIM
--
-- NOTE : selon la version de Supabase, l'insertion directe dans storage.buckets
-- peut echouer faute de droits. Dans ce cas, creer le bucket a la main via le
-- dashboard : Storage > New bucket > nom "sim", Private, file size limit 25 MB.
-- Les policies Storage sont dans le script 9A-5.

insert into storage.buckets (id, name, public, file_size_limit)
values ('sim', 'sim', false, 26214400)
on conflict (id) do nothing;

-- 26214400 octets = 25 Mo (25 * 1024 * 1024)
