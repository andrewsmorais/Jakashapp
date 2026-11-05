-- Comprovantes anexados aos lancamentos: bucket privado, cada pessoa so enxerga a propria pasta (receipts/<user_id>/...).
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS attachment_path TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS attachment_name TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_attachment_own_folder') THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_attachment_own_folder
      CHECK (attachment_path IS NULL OR (attachment_path LIKE user_id::text || '/%' AND length(attachment_path) <= 200));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 4194304, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'receipts_select_own') THEN
    CREATE POLICY receipts_select_own ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'receipts_insert_own') THEN
    CREATE POLICY receipts_insert_own ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'receipts_delete_own') THEN
    CREATE POLICY receipts_delete_own ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
  END IF;
END $$;
