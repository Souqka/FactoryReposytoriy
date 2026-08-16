-- One-shot: upsert_daily_goal can subtract current warehouse stock server-side.
-- Does not change tables. Safe to run after current schema.sql.
-- Do NOT run seed.sql.

CREATE OR REPLACE FUNCTION _item_stock_qty(p_item_id uuid, p_production_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_item items;
  v_prod uuid;
  v_qty  integer;
BEGIN
  IF p_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT i.* INTO v_item FROM items i WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT d.production_id INTO v_prod
    FROM item_groups g
    JOIN departments d ON d.id = g.department_id
   WHERE g.id = v_item.group_id;

  IF v_prod IS DISTINCT FROM p_production_id THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_item.is_sum, false) THEN
    SELECT COALESCE(SUM(s.quantity), 0) INTO v_qty
      FROM items s
     WHERE s.group_id = v_item.group_id
       AND COALESCE(s.is_sum, false) = false
       AND s.active;
  ELSE
    v_qty := v_item.quantity;
  END IF;

  RETURN GREATEST(COALESCE(v_qty, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION _item_stock_qty(uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'upsert_daily_goal'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION upsert_daily_goal(
  p_token         text,
  p_production_id uuid,
  p_goal_date     date DEFAULT NULL,
  p_target        integer DEFAULT 0,
  p_label         text DEFAULT 'упакованных рамок',
  p_id            uuid DEFAULT NULL,
  p_use_existing  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session app_sessions;
  v_goal    daily_goals;
  v_date    date;
  v_order   integer;
  v_label   text;
  v_target  integer;
  v_item_id uuid;
  v_start   integer;
BEGIN
  v_session := _require_session(p_token, false);
  PERFORM _assert_production(p_production_id);

  v_date := COALESCE(p_goal_date, CURRENT_DATE);
  IF v_session.role <> 'admin' THEN
    v_date := CURRENT_DATE;
  END IF;

  v_label := COALESCE(p_label, '');
  v_target := GREATEST(COALESCE(p_target, 0), 0);

  IF COALESCE(p_use_existing, false) THEN
    v_item_id := NULL;
    IF v_label ~* '^item:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN
      v_item_id := substring(v_label from 6 for 36)::uuid;
    END IF;
    v_start := _item_stock_qty(v_item_id, p_production_id);
    IF v_start IS NOT NULL THEN
      v_target := GREATEST(v_target - v_start, 0);
      v_label := 'item:' || v_item_id::text || '|start:' || v_start::text;
    END IF;
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE daily_goals
       SET target = v_target,
           label = v_label
     WHERE id = p_id
       AND production_id = p_production_id
       AND goal_date = v_date
    RETURNING * INTO v_goal;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'goal_not_found');
    END IF;
  ELSE
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_order
    FROM daily_goals
    WHERE production_id = p_production_id AND goal_date = v_date;

    INSERT INTO daily_goals (production_id, goal_date, target, label, sort_order)
    VALUES (
      p_production_id,
      v_date,
      v_target,
      v_label,
      v_order
    )
    RETURNING * INTO v_goal;
  END IF;

  RETURN jsonb_build_object('ok', true, 'goal', to_jsonb(v_goal));
END;
$$;

REVOKE ALL ON FUNCTION upsert_daily_goal(text, uuid, date, integer, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_daily_goal(text, uuid, date, integer, text, uuid, boolean) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('upsert_daily_goal', '_item_stock_qty')
ORDER BY p.proname, args;
