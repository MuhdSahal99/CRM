-- Hand-written (T9.06, ADR-0009). A share link serves its document's PDF only while the document exists: deleting the document must end its links
-- even if nothing revoked them (the delete path also revokes). The resolver, owned by crm_owner with FORCEd tables, needs a read policy on each parent.
CREATE POLICY resolver ON quotes FOR SELECT TO crm_owner USING (true);--> statement-breakpoint
CREATE POLICY resolver ON sales_orders FOR SELECT TO crm_owner USING (true);--> statement-breakpoint
CREATE POLICY resolver ON invoices FOR SELECT TO crm_owner USING (true);--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.resolve_share_link(p_token_hash bytea)
RETURNS TABLE (share_link_id uuid, storage_key text, filename varchar, content_type varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY
  WITH hit AS (
    UPDATE public.share_links s SET access_count = s.access_count + 1, last_accessed_at = now()
    FROM public.files f
    WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now()
      AND f.org_id = s.org_id AND f.id = s.file_id AND f.status = 'ready'
      AND CASE s.record_type
        WHEN 'quote' THEN EXISTS (SELECT 1 FROM public.quotes d WHERE d.org_id = s.org_id AND d.id = s.record_id AND d.deleted_at IS NULL)
        WHEN 'sales_order' THEN EXISTS (SELECT 1 FROM public.sales_orders d WHERE d.org_id = s.org_id AND d.id = s.record_id AND d.deleted_at IS NULL)
        WHEN 'invoice' THEN EXISTS (SELECT 1 FROM public.invoices d WHERE d.org_id = s.org_id AND d.id = s.record_id AND d.deleted_at IS NULL)
        ELSE false
      END
    RETURNING s.id, f.storage_key, f.filename, f.content_type
  )
  SELECT hit.id, hit.storage_key, hit.filename, hit.content_type FROM hit;
END $$;
