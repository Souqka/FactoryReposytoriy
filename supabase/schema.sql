-- =============================================================================
-- Система управления производством — схема PostgreSQL (Supabase)
-- =============================================================================
-- Порядок установки:
--   1) schema.sql   (этот файл)
--   2) policies.sql
--   3) seed.sql
--
-- Клиент использует только anon key. Пароли и service_role на клиент не попадают.
-- Запись данных идёт через SECURITY DEFINER RPC с проверкой сессии.
-- Позже app_login можно заменить на Supabase Auth без переписывания таблиц.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Сотрудники
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#64748b',
  active     boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Производства
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Отделы
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name          text NOT NULL,
  icon          text NOT NULL DEFAULT '📦',
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Группы позиций (имя item_groups, т.к. groups — служебное слово)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name          text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Позиции
-- version используется для защиты от гонок (optimistic lock)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES item_groups(id) ON DELETE CASCADE,
  name       text NOT NULL,
  quantity   integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_limit  integer NOT NULL DEFAULT 0 CHECK (min_limit >= 0),
  active     boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  version    integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- История изменений количества
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS change_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid REFERENCES productions(id) ON DELETE SET NULL,
  item_id       uuid REFERENCES items(id) ON DELETE SET NULL,
  employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  item_name     text,
  old_value     integer NOT NULL,
  new_value     integer NOT NULL,
  difference    integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Записки (PinBoard)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  text          text NOT NULL,
  author_id     uuid REFERENCES employees(id) ON DELETE SET NULL,
  assignee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  completed     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Дневные цели
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  goal_date     date NOT NULL DEFAULT CURRENT_DATE,
  target        integer NOT NULL DEFAULT 0 CHECK (target >= 0),
  label         text NOT NULL DEFAULT 'упакованных рамок',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (production_id, goal_date)
);

-- -----------------------------------------------------------------------------
-- Факт упаковки по датам (история приращений)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packed_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  packed_date   date NOT NULL DEFAULT CURRENT_DATE,
  quantity      integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Настройки приложения (хеши паролей и прочее)
-- Прямой SELECT для anon запрещён политиками.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Сессии прототипа (позже заменяются на Supabase Auth JWT)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  role        text NOT NULL CHECK (role IN ('user', 'admin')),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Индексы
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_departments_production ON departments (production_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_groups_department ON item_groups (department_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_items_group ON items (group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_history_production_created ON change_history (production_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_item ON change_history (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_production ON notes (production_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packed_prod_date ON packed_history (production_id, packed_date);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON app_sessions (token);
CREATE INDEX IF NOT EXISTS idx_employees_sort ON employees (sort_order);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_productions_updated ON productions;
CREATE TRIGGER trg_productions_updated
  BEFORE UPDATE ON productions
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_items_updated ON items;
CREATE TRIGGER trg_items_updated
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_notes_updated ON notes;
CREATE TRIGGER trg_notes_updated
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_goals_updated ON daily_goals;
CREATE TRIGGER trg_goals_updated
  BEFORE UPDATE ON daily_goals
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- -----------------------------------------------------------------------------
-- Вспомогательные RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _require_session(p_token text, p_admin_only boolean DEFAULT false)
RETURNS app_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'no_session' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_session
  FROM app_sessions
  WHERE token = p_token
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_session' USING ERRCODE = '28000';
  END IF;

  IF p_admin_only AND v_session.role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE app_sessions
     SET expires_at = now() + interval '12 hours'
   WHERE id = v_session.id;

  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION _production_id_for_item(p_item_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.production_id
  FROM items i
  JOIN item_groups g ON g.id = i.group_id
  JOIN departments d ON d.id = g.department_id
  WHERE i.id = p_item_id
$$;

-- -----------------------------------------------------------------------------
-- Вход: пароль проверяется на сервере (хеш в settings).
-- Клиент НЕ сравнивает строки 1980 / 1432.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_login(p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_hash  text;
  v_admin_hash text;
  v_role       text;
  v_session    app_sessions;
BEGIN
  SELECT value->>'hash' INTO v_admin_hash FROM settings WHERE key = 'admin_password';
  SELECT value->>'hash' INTO v_user_hash  FROM settings WHERE key = 'user_password';

  IF v_admin_hash IS NOT NULL AND crypt(p_password, v_admin_hash) = v_admin_hash THEN
    v_role := 'admin';
  ELSIF v_user_hash IS NOT NULL AND crypt(p_password, v_user_hash) = v_user_hash THEN
    v_role := 'user';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_password');
  END IF;

  INSERT INTO app_sessions (role)
  VALUES (v_role)
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'ok', true,
    'role', v_session.role,
    'token', v_session.token,
    'expires_at', v_session.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_logout(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM app_sessions WHERE token = p_token;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION app_session(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
BEGIN
  v_session := _require_session(p_token, false);
  RETURN jsonb_build_object(
    'ok', true,
    'role', v_session.role,
    'employee_id', v_session.employee_id,
    'expires_at', v_session.expires_at
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION app_set_employee(p_token text, p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
BEGIN
  v_session := _require_session(p_token, false);

  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = p_employee_id AND active = true) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'employee_not_found');
  END IF;

  UPDATE app_sessions
     SET employee_id = p_employee_id
   WHERE id = v_session.id;

  RETURN jsonb_build_object('ok', true, 'employee_id', p_employee_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- Изменение количества: compare-and-swap по старому значению.
-- Старый запрос не перезапишет более новое значение.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_item_quantity(
  p_token   text,
  p_item_id uuid,
  p_old_qty integer,
  p_new_qty integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session     app_sessions;
  v_item        items;
  v_updated     items;
  v_production  uuid;
BEGIN
  v_session := _require_session(p_token, false);

  IF p_new_qty IS NULL OR p_new_qty < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  END IF;

  SELECT * INTO v_item FROM items WHERE id = p_item_id AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item_not_found');
  END IF;

  UPDATE items
     SET quantity = p_new_qty,
         version = version + 1
   WHERE id = p_item_id
     AND quantity = p_old_qty
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    SELECT * INTO v_item FROM items WHERE id = p_item_id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'quantity', v_item.quantity,
      'version', v_item.version
    );
  END IF;

  v_production := _production_id_for_item(p_item_id);

  INSERT INTO change_history (
    production_id, item_id, employee_id, item_name,
    old_value, new_value, difference
  ) VALUES (
    v_production,
    p_item_id,
    v_session.employee_id,
    v_updated.name,
    p_old_qty,
    p_new_qty,
    p_new_qty - p_old_qty
  );

  RETURN jsonb_build_object(
    'ok', true,
    'quantity', v_updated.quantity,
    'version', v_updated.version
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Записки
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_note(
  p_token         text,
  p_production_id uuid,
  p_text          text,
  p_assignee_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
  v_note    notes;
BEGIN
  v_session := _require_session(p_token, false);

  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_text');
  END IF;

  INSERT INTO notes (production_id, text, author_id, assignee_id)
  VALUES (p_production_id, trim(p_text), v_session.employee_id, p_assignee_id)
  RETURNING * INTO v_note;

  RETURN jsonb_build_object('ok', true, 'note', to_jsonb(v_note));
END;
$$;

CREATE OR REPLACE FUNCTION update_note(
  p_token   text,
  p_note_id uuid,
  p_patch   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
  v_note    notes;
BEGIN
  v_session := _require_session(p_token, false);

  UPDATE notes
     SET text = COALESCE(p_patch->>'text', text),
         assignee_id = CASE
           WHEN p_patch ? 'assignee_id' THEN NULLIF(p_patch->>'assignee_id', '')::uuid
           ELSE assignee_id
         END,
         completed = CASE
           WHEN p_patch ? 'completed' THEN (p_patch->>'completed')::boolean
           ELSE completed
         END
   WHERE id = p_note_id
  RETURNING * INTO v_note;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'note', to_jsonb(v_note));
END;
$$;

CREATE OR REPLACE FUNCTION delete_note(p_token text, p_note_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
BEGIN
  v_session := _require_session(p_token, false);
  DELETE FROM notes WHERE id = p_note_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- Дневные цели и упаковка
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_daily_goal(
  p_token         text,
  p_production_id uuid,
  p_goal_date     date,
  p_target        integer,
  p_label         text DEFAULT 'упакованных рамок'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
  v_goal    daily_goals;
BEGIN
  v_session := _require_session(p_token, false);

  INSERT INTO daily_goals (production_id, goal_date, target, label)
  VALUES (p_production_id, p_goal_date, GREATEST(p_target, 0), COALESCE(NULLIF(p_label, ''), 'упакованных рамок'))
  ON CONFLICT (production_id, goal_date)
  DO UPDATE SET target = EXCLUDED.target, label = EXCLUDED.label
  RETURNING * INTO v_goal;

  RETURN jsonb_build_object('ok', true, 'goal', to_jsonb(v_goal));
END;
$$;

CREATE OR REPLACE FUNCTION add_packed(
  p_token         text,
  p_production_id uuid,
  p_quantity      integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
  v_fact    integer;
BEGIN
  v_session := _require_session(p_token, false);

  IF p_quantity = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'zero_quantity');
  END IF;

  INSERT INTO packed_history (production_id, employee_id, packed_date, quantity)
  VALUES (p_production_id, v_session.employee_id, CURRENT_DATE, p_quantity);

  SELECT COALESCE(SUM(quantity), 0) INTO v_fact
  FROM packed_history
  WHERE production_id = p_production_id
    AND packed_date = CURRENT_DATE;

  IF v_fact < 0 THEN
    -- не даём факту уйти ниже нуля: откатываем последнюю запись
    DELETE FROM packed_history
     WHERE id = (
       SELECT id FROM packed_history
       WHERE production_id = p_production_id AND packed_date = CURRENT_DATE
       ORDER BY created_at DESC
       LIMIT 1
     );
    v_fact := 0;
    RETURN jsonb_build_object('ok', false, 'error', 'below_zero', 'fact', v_fact);
  END IF;

  RETURN jsonb_build_object('ok', true, 'fact', v_fact);
END;
$$;

-- -----------------------------------------------------------------------------
-- Админ: универсальное сохранение сущностей конфигурации
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_save(p_token text, p_entity text, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
  v_id      uuid;
  v_row     jsonb;
  r         record;
BEGIN
  v_session := _require_session(p_token, true);
  v_id := NULLIF(p_data->>'id', '')::uuid;

  IF p_entity = 'production' THEN
    IF v_id IS NULL THEN
      INSERT INTO productions (name, active, sort_order)
      VALUES (
        COALESCE(NULLIF(p_data->>'name', ''), 'Новое производство'),
        COALESCE((p_data->>'active')::boolean, true),
        COALESCE((p_data->>'sort_order')::integer, 0)
      )
      RETURNING * INTO r;
    ELSE
      UPDATE productions
         SET name = COALESCE(NULLIF(p_data->>'name', ''), name),
             active = COALESCE((p_data->>'active')::boolean, active),
             sort_order = COALESCE((p_data->>'sort_order')::integer, sort_order)
       WHERE id = v_id
      RETURNING * INTO r;
    END IF;

  ELSIF p_entity = 'department' THEN
    IF v_id IS NULL THEN
      INSERT INTO departments (production_id, name, icon, active, sort_order)
      VALUES (
        (p_data->>'production_id')::uuid,
        COALESCE(NULLIF(p_data->>'name', ''), 'Новый отдел'),
        COALESCE(NULLIF(p_data->>'icon', ''), '📦'),
        COALESCE((p_data->>'active')::boolean, true),
        COALESCE((p_data->>'sort_order')::integer, 0)
      )
      RETURNING * INTO r;
    ELSE
      UPDATE departments
         SET name = COALESCE(NULLIF(p_data->>'name', ''), name),
             icon = COALESCE(NULLIF(p_data->>'icon', ''), icon),
             active = COALESCE((p_data->>'active')::boolean, active),
             sort_order = COALESCE((p_data->>'sort_order')::integer, sort_order)
       WHERE id = v_id
      RETURNING * INTO r;
    END IF;

  ELSIF p_entity = 'group' THEN
    IF v_id IS NULL THEN
      INSERT INTO item_groups (department_id, name, active, sort_order)
      VALUES (
        (p_data->>'department_id')::uuid,
        COALESCE(NULLIF(p_data->>'name', ''), 'Новая группа'),
        COALESCE((p_data->>'active')::boolean, true),
        COALESCE((p_data->>'sort_order')::integer, 0)
      )
      RETURNING * INTO r;
    ELSE
      UPDATE item_groups
         SET name = COALESCE(NULLIF(p_data->>'name', ''), name),
             active = COALESCE((p_data->>'active')::boolean, active),
             sort_order = COALESCE((p_data->>'sort_order')::integer, sort_order)
       WHERE id = v_id
      RETURNING * INTO r;
    END IF;

  ELSIF p_entity = 'item' THEN
    IF v_id IS NULL THEN
      INSERT INTO items (group_id, name, quantity, min_limit, active, sort_order)
      VALUES (
        (p_data->>'group_id')::uuid,
        COALESCE(NULLIF(p_data->>'name', ''), 'Новая позиция'),
        COALESCE((p_data->>'quantity')::integer, 0),
        COALESCE((p_data->>'min_limit')::integer, 0),
        COALESCE((p_data->>'active')::boolean, true),
        COALESCE((p_data->>'sort_order')::integer, 0)
      )
      RETURNING * INTO r;
    ELSE
      UPDATE items
         SET name = COALESCE(NULLIF(p_data->>'name', ''), name),
             quantity = COALESCE((p_data->>'quantity')::integer, quantity),
             min_limit = COALESCE((p_data->>'min_limit')::integer, min_limit),
             active = COALESCE((p_data->>'active')::boolean, active),
             sort_order = COALESCE((p_data->>'sort_order')::integer, sort_order),
             group_id = COALESCE(NULLIF(p_data->>'group_id', '')::uuid, group_id)
       WHERE id = v_id
      RETURNING * INTO r;
    END IF;

  ELSIF p_entity = 'employee' THEN
    IF v_id IS NULL THEN
      INSERT INTO employees (name, color, active, sort_order)
      VALUES (
        COALESCE(NULLIF(p_data->>'name', ''), 'Новый сотрудник'),
        COALESCE(NULLIF(p_data->>'color', ''), '#64748b'),
        COALESCE((p_data->>'active')::boolean, true),
        COALESCE((p_data->>'sort_order')::integer, 0)
      )
      RETURNING * INTO r;
    ELSE
      UPDATE employees
         SET name = COALESCE(NULLIF(p_data->>'name', ''), name),
             color = COALESCE(NULLIF(p_data->>'color', ''), color),
             active = COALESCE((p_data->>'active')::boolean, active),
             sort_order = COALESCE((p_data->>'sort_order')::integer, sort_order)
       WHERE id = v_id
      RETURNING * INTO r;
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_entity');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_row := to_jsonb(r);
  RETURN jsonb_build_object('ok', true, 'row', v_row);
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete(p_token text, p_entity text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
BEGIN
  v_session := _require_session(p_token, true);

  IF p_entity = 'production' THEN
    DELETE FROM productions WHERE id = p_id;
  ELSIF p_entity = 'department' THEN
    DELETE FROM departments WHERE id = p_id;
  ELSIF p_entity = 'group' THEN
    DELETE FROM item_groups WHERE id = p_id;
  ELSIF p_entity = 'item' THEN
    DELETE FROM items WHERE id = p_id;
  ELSIF p_entity = 'employee' THEN
    -- мягкое удаление: история сохраняет имя через employee_id SET NULL при hard delete,
    -- поэтому деактивируем. Hard delete только если явно active=false уже было? Пользователь
    -- просил удалить/деактивировать — деактивация безопаснее для истории.
    UPDATE employees SET active = false WHERE id = p_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_entity');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION admin_reorder(p_token text, p_entity text, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session app_sessions;
  i         integer;
BEGIN
  v_session := _require_session(p_token, true);

  FOR i IN 1 .. coalesce(array_length(p_ids, 1), 0) LOOP
    IF p_entity = 'production' THEN
      UPDATE productions SET sort_order = i - 1 WHERE id = p_ids[i];
    ELSIF p_entity = 'department' THEN
      UPDATE departments SET sort_order = i - 1 WHERE id = p_ids[i];
    ELSIF p_entity = 'group' THEN
      UPDATE item_groups SET sort_order = i - 1 WHERE id = p_ids[i];
    ELSIF p_entity = 'item' THEN
      UPDATE items SET sort_order = i - 1 WHERE id = p_ids[i];
    ELSIF p_entity = 'employee' THEN
      UPDATE employees SET sort_order = i - 1 WHERE id = p_ids[i];
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'unknown_entity');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$$;
