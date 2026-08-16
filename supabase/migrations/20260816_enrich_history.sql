-- One-shot: enrich app_get_history with employee/production/department names.
-- Does not change tables. Safe to run after current schema.sql.
-- Do NOT run seed.sql.

CREATE OR REPLACE FUNCTION app_get_history(p_token text, p_production_id uuid, p_limit integer DEFAULT 80)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session app_sessions;
  v_rows    jsonb;
  v_limit   integer;
BEGIN
  v_session := _require_session(p_token, false);
  IF p_production_id IS NOT NULL THEN
    PERFORM _assert_production(p_production_id);
  END IF;

  v_limit := GREATEST(LEAST(COALESCE(p_limit, 80), 300), 1);

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        ch.id,
        ch.production_id,
        ch.item_id,
        ch.employee_id,
        ch.item_name,
        ch.old_value,
        ch.new_value,
        ch.difference,
        ch.created_at,
        e.name  AS employee_name,
        e.color AS employee_color,
        p.name  AS production_name,
        d.id    AS department_id,
        d.name  AS department_name
      FROM change_history ch
      LEFT JOIN employees e ON e.id = ch.employee_id
      LEFT JOIN productions p ON p.id = ch.production_id
      LEFT JOIN items i ON i.id = ch.item_id
      LEFT JOIN item_groups g ON g.id = i.group_id
      LEFT JOIN departments d ON d.id = g.department_id
      WHERE p_production_id IS NULL OR ch.production_id = p_production_id
      ORDER BY ch.created_at DESC
      LIMIT v_limit
    ) h;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION app_get_history(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_get_history(text, uuid, integer) TO anon, authenticated;
