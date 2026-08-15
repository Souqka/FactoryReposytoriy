-- =============================================================================
-- Row Level Security и права доступа (security pass)
-- =============================================================================
-- Анонимный ключ может ТОЛЬКО вызывать перечисленные RPC.
-- Прямой SELECT/INSERT/UPDATE/DELETE по таблицам запрещён.
-- Чтение данных — через SECURITY DEFINER RPC с проверкой app_sessions.
-- Realtime — broadcast (realtime.send), не postgres_changes + USING(true).
-- =============================================================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE packed_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Убрать прежние публичные SELECT-политики
DROP POLICY IF EXISTS employees_select ON employees;
DROP POLICY IF EXISTS productions_select ON productions;
DROP POLICY IF EXISTS departments_select ON departments;
DROP POLICY IF EXISTS item_groups_select ON item_groups;
DROP POLICY IF EXISTS items_select ON items;
DROP POLICY IF EXISTS change_history_select ON change_history;
DROP POLICY IF EXISTS notes_select ON notes;
DROP POLICY IF EXISTS daily_goals_select ON daily_goals;
DROP POLICY IF EXISTS packed_history_select ON packed_history;

-- Политик нет: RLS включён → для anon/authenticated всё закрыто.
-- Владелец таблиц и SECURITY DEFINER RPC обходят RLS.

REVOKE ALL ON TABLE employees FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE productions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE departments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE item_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE change_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE notes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE daily_goals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE packed_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE app_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE login_attempts FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Функции: по умолчанию EXECUTE у PUBLIC — забираем и выдаём точечно
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION _require_session(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _production_id_for_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _assert_production(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _request_ip_hash() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _notify_live() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_updated_at() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION _require_employee(app_sessions) FROM PUBLIC, anon, authenticated;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

DROP FUNCTION IF EXISTS app_login(text);

REVOKE ALL ON FUNCTION app_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_logout(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_set_employee(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_item_quantity(text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_note(text, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_note(text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_note(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION upsert_daily_goal(text, uuid, date, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_packed(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_save(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_delete(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_reorder(text, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_get_employees(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_get_productions(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_get_tree(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_get_history(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_get_notes(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_get_goal(text, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_get_packed_fact(text, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_get_packed_history(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_set_employee(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_item_quantity(text, uuid, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_note(text, uuid, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_note(text, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_note(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_daily_goal(text, uuid, date, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION add_packed(text, uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_save(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_delete(text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_reorder(text, text, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_get_employees(text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_get_productions(text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_get_tree(text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_get_history(text, uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_get_notes(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_get_goal(text, uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_get_packed_fact(text, uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_get_packed_history(text, uuid) TO anon, authenticated;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION update_item_min_limit(text, uuid, integer) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION update_item_min_limit(text, uuid, integer) TO anon, authenticated;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Убрать таблицы из postgres_changes publication:
-- без SELECT-политики события всё равно не доходили бы до anon,
-- broadcast идёт через realtime.send, не через publication.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE change_history;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE notes;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE daily_goals;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE packed_history;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE productions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE departments;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE item_groups;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE employees;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
