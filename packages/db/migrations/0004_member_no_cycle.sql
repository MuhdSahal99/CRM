-- Slice 1 / T1.12. A reporting line may never loop back (AC-37): visible_owner_ids walks this tree (ADR-0005).
-- A self-manager is already refused by the member_manager_not_self CHECK.

CREATE FUNCTION member_no_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- No manager, or self (the CHECK refuses that one after this trigger).
  IF NEW.manager_id IS NULL OR NEW.manager_id = NEW.user_id THEN RETURN NEW; END IF;
  -- One hierarchy change per org at a time: two concurrent edits (A→B, B→A) could each see no cycle.
  PERFORM pg_advisory_xact_lock(hashtextextended('member_hierarchy:' || NEW.org_id::text, 0));
  -- Walk up from the new manager; reaching this member means a cycle. UNION stops on any loop already present.
  IF EXISTS (
    WITH RECURSIVE chain (user_id) AS (
      SELECT NEW.manager_id
      UNION
      SELECT m.manager_id FROM member m JOIN chain c ON m.org_id = NEW.org_id AND m.user_id = c.user_id
      WHERE m.manager_id IS NOT NULL
    )
    SELECT 1 FROM chain WHERE user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'member_no_cycle: % cannot report to %, it would create a reporting cycle', NEW.user_id, NEW.manager_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER member_no_cycle BEFORE INSERT OR UPDATE OF manager_id ON member
  FOR EACH ROW EXECUTE FUNCTION member_no_cycle();
