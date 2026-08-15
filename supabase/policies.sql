-- =============================================================================
-- Row Level Security и права доступа
-- =============================================================================
-- Анонимный ключ может:
--   • читать операционные таблицы (нужно для Realtime);
--   • вызывать RPC входа и мутаций.
-- Анонимный ключ НЕ может:
--   • напрямую INSERT/UPDATE/DELETE;
--   • читать settings и app_sessions (там хеши паролей и токены).
--
-- Это не замена полноценной авторизации. После перехода на Supabase Auth
-- политики можно сузить до auth.uid() / JWT claims.
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

-- Чтение справочников и операционных данных
DROP POLICY IF EXISTS employees_select ON employees;
CREATE POLICY employees_select ON employees FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS productions_select ON productions;
CREATE POLICY productions_select ON productions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS departments_select ON departments;
CREATE POLICY departments_select ON departments FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS item_groups_select ON item_groups;
CREATE POLICY item_groups_select ON item_groups FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS items_select ON items;
CREATE POLICY items_select ON items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS change_history_select ON change_history;
CREATE POLICY change_history_select ON change_history FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS notes_select ON notes;
CREATE POLICY notes_select ON notes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS daily_goals_select ON daily_goals;
CREATE POLICY daily_goals_select ON daily_goals FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS packed_history_select ON packed_history;
CREATE POLICY packed_history_select ON packed_history FOR SELECT TO anon, authenticated USING (true);

-- settings и app_sessions: политик SELECT нет → для anon закрыто.
-- Запись во все таблицы: политик INSERT/UPDATE/DELETE нет → только SECURITY DEFINER.

-- -----------------------------------------------------------------------------
-- Права на таблицы
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE settings FROM anon, authenticated, public;
REVOKE ALL ON TABLE app_sessions FROM anon, authenticated, public;

GRANT SELECT ON TABLE employees TO anon, authenticated;
GRANT SELECT ON TABLE productions TO anon, authenticated;
GRANT SELECT ON TABLE departments TO anon, authenticated;
GRANT SELECT ON TABLE item_groups TO anon, authenticated;
GRANT SELECT ON TABLE items TO anon, authenticated;
GRANT SELECT ON TABLE change_history TO anon, authenticated;
GRANT SELECT ON TABLE notes TO anon, authenticated;
GRANT SELECT ON TABLE daily_goals TO anon, authenticated;
GRANT SELECT ON TABLE packed_history TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Права на функции
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION _require_session(text, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION _production_id_for_item(uuid) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION app_login(text) TO anon, authenticated;
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

-- -----------------------------------------------------------------------------
-- Realtime: публикация изменений для живого обновления клиентов
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE change_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE daily_goals;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE packed_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE productions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE departments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE item_groups;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE employees;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
