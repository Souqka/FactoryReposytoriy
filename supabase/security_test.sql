-- =============================================================================
-- Проверки модели безопасности (запускать в SQL Editor после schema + policies + seed)
--
-- Ожидание: блок завершается NOTICE «SECURITY TESTS PASSED».
-- При провале — EXCEPTION с именем теста.
--
-- Задержки brute-force отключены через GUC app.skip_login_delay (только в этой сессии).
-- =============================================================================

SELECT set_config('app.skip_login_delay', 'on', false);

DO $$
DECLARE
  v_user jsonb;
  v_admin jsonb;
  v_user_token text;
  v_admin_token text;
  v_item_id uuid := '55555555-5555-5555-5555-555555555001';
  v_prod_id uuid := '22222222-2222-2222-2222-222222222001';
  v_emp_artur uuid := '11111111-1111-1111-1111-111111111001';
  v_emp_vika uuid := '11111111-1111-1111-1111-111111111006';
  v_qty integer;
  v_res jsonb;
  v_can boolean;
  v_n integer;
BEGIN
  -- ---------------------------------------------------------------------------
  -- Неавторизованный: нет SELECT по таблицам
  -- ---------------------------------------------------------------------------
  BEGIN
    SET LOCAL ROLE anon;
    EXECUTE 'SELECT count(*) FROM items';
    RAISE EXCEPTION 'FAIL: anon_select_items';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE anon;
    EXECUTE 'SELECT count(*) FROM app_sessions';
    RAISE EXCEPTION 'FAIL: anon_select_sessions';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE anon;
    EXECUTE 'SELECT count(*) FROM settings';
    RAISE EXCEPTION 'FAIL: anon_select_settings';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE anon;
    EXECUTE 'SELECT count(*) FROM productions';
    RAISE EXCEPTION 'FAIL: anon_select_productions';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE anon;
    EXECUTE 'SELECT count(*) FROM change_history';
    RAISE EXCEPTION 'FAIL: anon_select_history';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE anon;
    EXECUTE 'SELECT count(*) FROM login_attempts';
    RAISE EXCEPTION 'FAIL: anon_select_login_attempts';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;

  -- Прямые INSERT/UPDATE/DELETE
  BEGIN
    SET LOCAL ROLE anon;
    EXECUTE 'UPDATE items SET quantity = 999 WHERE id = $1' USING v_item_id;
    RAISE EXCEPTION 'FAIL: anon_update_items';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE anon;
    EXECUTE 'INSERT INTO change_history (old_value, new_value, difference) VALUES (1,2,1)';
    RAISE EXCEPTION 'FAIL: anon_insert_history';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;

  -- Чтение без токена
  v_res := app_get_tree('not-a-token', v_prod_id, false);
  IF v_res->>'ok' = 'true' THEN
    RAISE EXCEPTION 'FAIL: read_without_session';
  END IF;

  BEGIN
    PERFORM admin_save('not-a-token', 'production', '{"name":"x"}'::jsonb);
    RAISE EXCEPTION 'FAIL: admin_without_session';
  EXCEPTION
    WHEN SQLSTATE '28000' THEN NULL;
    WHEN SQLSTATE '42501' THEN NULL;
  END;

  -- ---------------------------------------------------------------------------
  -- Вход: 1980 / 1432, hash не в ответе
  -- ---------------------------------------------------------------------------
  v_user := app_login('1980', 'security-test-user');
  IF v_user->>'ok' <> 'true' OR v_user->>'role' <> 'user' THEN
    RAISE EXCEPTION 'FAIL: user_login %', v_user;
  END IF;
  IF v_user ? 'hash' OR (v_user::text ILIKE '%crypt%') THEN
    RAISE EXCEPTION 'FAIL: login_leaks_hash';
  END IF;
  v_user_token := v_user->>'token';

  v_admin := app_login('1432', 'security-test-admin');
  IF v_admin->>'ok' <> 'true' OR v_admin->>'role' <> 'admin' THEN
    RAISE EXCEPTION 'FAIL: admin_login %', v_admin;
  END IF;
  v_admin_token := v_admin->>'token';

  v_res := app_login('0000', 'security-test-wrong');
  IF v_res->>'error' <> 'invalid_password' THEN
    RAISE EXCEPTION 'FAIL: wrong_password %', v_res;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Обычный пользователь: чтение и количество
  -- ---------------------------------------------------------------------------
  v_res := app_set_employee(v_user_token, v_emp_artur);
  IF v_res->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'FAIL: set_employee %', v_res;
  END IF;

  v_res := app_get_productions(v_user_token, false);
  IF v_res->>'ok' <> 'true' OR jsonb_array_length(v_res->'rows') < 1 THEN
    RAISE EXCEPTION 'FAIL: user_get_productions %', v_res;
  END IF;

  -- include_inactive требует admin
  BEGIN
    PERFORM app_get_employees(v_user_token, true);
    RAISE EXCEPTION 'FAIL: user_include_inactive';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN NULL;
  END;

  SELECT quantity INTO v_qty FROM items WHERE id = v_item_id;

  v_res := update_item_quantity(v_user_token, v_item_id, v_qty, v_qty + 1);
  IF v_res->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'FAIL: qty_update %', v_res;
  END IF;

  -- compare-and-swap: повтор со старым значением — conflict
  v_res := update_item_quantity(v_user_token, v_item_id, v_qty, v_qty + 5);
  IF v_res->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL: cas_conflict %', v_res;
  END IF;

  -- история от имени сессии (Артур), не подделать Вику
  SELECT count(*) INTO v_n
  FROM change_history
  WHERE item_id = v_item_id
    AND employee_id = v_emp_artur
    AND old_value = v_qty
    AND new_value = v_qty + 1;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'FAIL: history_employee_from_session';
  END IF;

  -- вернуть количество
  v_res := update_item_quantity(v_user_token, v_item_id, v_qty + 1, v_qty);
  IF v_res->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'FAIL: qty_restore %', v_res;
  END IF;

  -- цепочка: несуществующий item
  v_res := update_item_quantity(v_user_token, '00000000-0000-0000-0000-000000000099', 0, 1);
  IF v_res->>'error' <> 'item_not_found' THEN
    RAISE EXCEPTION 'FAIL: missing_item %', v_res;
  END IF;

  -- минимум позиции: пользователь может менять порог, не количество
  UPDATE items SET min_limit = 0 WHERE id = v_item_id;
  v_res := update_item_min_limit(v_user_token, v_item_id, 7);
  IF v_res->>'ok' <> 'true' OR (v_res->>'min_limit')::integer <> 7 THEN
    RAISE EXCEPTION 'FAIL: update_item_min_limit %', v_res;
  END IF;
  v_res := update_item_min_limit(v_user_token, v_item_id, -1);
  IF v_res->>'error' <> 'invalid_min' THEN
    RAISE EXCEPTION 'FAIL: min_negative %', v_res;
  END IF;

  -- notes
  v_res := create_note(v_user_token, v_prod_id, 'security test note', NULL);
  IF v_res->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'FAIL: create_note %', v_res;
  END IF;
  IF (v_res->'note'->>'author_id') <> v_emp_artur::text THEN
    RAISE EXCEPTION 'FAIL: note_author_from_session %', v_res;
  END IF;

  -- admin RPC недоступны пользователю
  BEGIN
    PERFORM admin_save(v_user_token, 'production', '{"name":"hack"}'::jsonb);
    RAISE EXCEPTION 'FAIL: user_admin_save';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM admin_delete(v_user_token, 'item', v_item_id);
    RAISE EXCEPTION 'FAIL: user_admin_delete';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN NULL;
  END;

  -- ---------------------------------------------------------------------------
  -- Администратор
  -- ---------------------------------------------------------------------------
  v_res := admin_save(v_admin_token, 'production', jsonb_build_object('name', 'Security Test Plant', 'sort_order', 99, 'active', true));
  IF v_res->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'FAIL: admin_create_production %', v_res;
  END IF;
  PERFORM admin_delete(v_admin_token, 'production', (v_res->'row'->>'id')::uuid);

  v_res := admin_save(v_admin_token, 'employee', jsonb_build_object('name', 'Test Emp', 'color', '#111111', 'active', true));
  IF v_res->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'FAIL: admin_create_employee %', v_res;
  END IF;
  PERFORM admin_delete(v_admin_token, 'employee', (v_res->'row'->>'id')::uuid);

  v_res := app_get_employees(v_admin_token, true);
  IF v_res->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'FAIL: admin_list_employees %', v_res;
  END IF;
END;
$$;

-- Brute-force: 5 неудач с одного client_key → too_many_attempts
DO $$
DECLARE
  i int;
  v jsonb;
  k text := 'security-test-bruteforce-' || gen_random_uuid()::text;
BEGIN
  PERFORM set_config('app.skip_login_delay', 'on', true);
  FOR i IN 1..5 LOOP
    v := app_login('0000', k);
  END LOOP;
  v := app_login('1980', k);
  IF v->>'error' <> 'too_many_attempts' THEN
    RAISE EXCEPTION 'FAIL: brute_force_lockout %', v;
  END IF;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'SECURITY TESTS PASSED';
END;
$$;
