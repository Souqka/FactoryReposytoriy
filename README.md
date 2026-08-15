# Система управления производством

Внутреннее веб-приложение для учёта запасов и хода работ. Статический frontend (HTML/CSS/vanilla JS) на GitHub Pages, данные в Supabase.

Одновременно рассчитано на 1–3 сотрудников. Структура производств меняется в админ-панели, без правки кода.

## Архитектура

```
GitHub  →  GitHub Pages  →  Frontend
                                 ↓
                            Supabase
                     ┌───────────┼───────────┐
                     PostgreSQL  Auth*   Realtime
```

\* Сейчас вход — прототипные пароли через RPC. Таблицы и UI уже отделены от способа входа, чтобы позже включить Supabase Auth.

Секретные ключи (`service_role`) во frontend не попадают. Клиент использует только **anon / public key** и Row Level Security. Запись идёт через `SECURITY DEFINER` функции с проверкой сессии.

## Связи таблиц

```
productions 1──∞ departments 1──∞ item_groups 1──∞ items
     │                                                    │
     ├──── ∞ notes                                        │
     ├──── ∞ daily_goals                                  │
     ├──── ∞ packed_history                               │
     └──── ∞ change_history ∞──────── employees           │
                   │                                      │
                   └──────── item_id ─────────────────────┘

settings        хеши паролей, не читаются с клиента
app_sessions    токены прототипа (позже заменяются JWT Auth)
```

## Авторизация и права

| Роль  | Пароль прототипа | Что открывает |
|-------|------------------|---------------|
| user  | `1980`           | рабочий экран |
| admin | `1432`           | `/admin.html` |

Пароли **не сравниваются в JavaScript** (`if (password === "1432")` нет). Они хранятся как bcrypt-хеш в `settings` и проверяются функцией `app_login`.

Это **прототип сессий**, не полноценная защита аккаунтов. Anon key публичный. Следующий шаг — Supabase Auth.

Пользовательский вход:

1. Пароль → сессия (`user` или `admin`)
2. Выбор сотрудника (цвет из таблицы `employees`)
3. Выбор производства
4. Работа с позициями / историей / записками / планом

Админ: тот же RPC, роль `admin` проверяется **на сервере**.

## Security model

Current authentication is a prototype session-based system.
Supabase Auth is planned as a future hardening step.

Приложение **не** следует считать полностью безопасным для публичного интернета. Это внутренний MVP для 1–3 сотрудников.

### Что защищает RLS

На всех таблицах включён Row Level Security, **политик SELECT/INSERT/UPDATE/DELETE для `anon` нет**. Прямой REST-запрос вроде `GET /rest/v1/items` без сессии не возвращает производственные данные.

Закрыты также:

* `app_sessions`
* `settings` (хеши паролей)
* `login_attempts`
* `change_history` (нет прямого INSERT/UPDATE/DELETE)

### Что защищают RPC

Все чтение и запись идут через `SECURITY DEFINER` функции. Они:

* проверяют токен в `app_sessions` (`_require_session`);
* для админских операций требуют `role = admin` **из строки сессии**, не из JavaScript;
* для количества берут `employee_id` только из сессии;
* проверяют цепочку `item → item_groups → departments → productions`;
* пишут `change_history` в той же транзакции, что и `UPDATE items` (compare-and-swap по `quantity = old_value`).

Вызов `admin_save` / `admin_delete` / `admin_reorder` с пользовательским токеном возвращает `forbidden`.

### Как работает app_session

1. `app_login(password, client_key)` сверяет bcrypt-хеш в `settings` и создаёт строку в `app_sessions`.
2. Клиент хранит только `token` + `role` в localStorage.
3. Каждый RPC принимает `p_token` и сам читает роль и сотрудника.
4. Frontend **не** является источником истины для `employee_id` / `role`.

### Anon key и service_role

* Anon / publishable key **публичный** (лежит в `config/config.js`, это нормально для GitHub Pages).
* `service_role` во frontend и в репозитории **не используется**.
* Тот, у кого есть anon key, может вызывать разрешённые RPC (`app_login` и т.д.), но не может читать таблицы напрямую.

### Brute-force

`login_attempts` считает неудачные входы за 15 минут:

* 5 ошибок с одного `client_key` (ключ в localStorage, переживает refresh);
* 20 ошибок с одного IP (хеш из `X-Forwarded-For`, если его передаёт Supabase).

После лимита даже верный пароль не принимается 15 минут; на ошибку добавляется `pg_sleep`.

Ограничение: атакующий может менять `client_key` и IP (VPN). Это задержка, не полноценный WAF. Bcrypt тоже замедляет перебор.

### Realtime без публичного SELECT

`postgres_changes` требует SELECT-политику, поэтому **таблицы не публикуются** в `supabase_realtime`.

Вместо этого триггер шлёт `realtime.send(..., private => false)` в канал `factory-live`. Клиенты с валидной сессией подписаны на broadcast и либо применяют `{id, quantity, version}`, либо перечитывают данные через RPC.

Ограничение: канал broadcast **публичный** (без JWT нельзя сделать private). Знающий anon key и имя канала может видеть компактные live-события. Полный каталог, историю и записки через REST он не выгрузит.

### Известные ограничения прототипа

* Пароли `1980` / `1432` — короткие общие секреты, не персональные аккаунты.
* Сессия — непрозрачный токен в `app_sessions`, не JWT Supabase Auth.
* Утечка токена = действия от имени этой сессии до истечения (12 часов).
* Live-broadcast не аутентифицирован (см. выше).
* Rate limit можно обойти сменой device id + IP.
* Локальный режим (без Supabase) проверяет пароль в браузере — только для разработки.

Проверки: `supabase/security_test.sql`.

### Уже развёрнутая база

Повторно выполнить `schema.sql`, затем `policies.sql`. `seed.sql` не запускать повторно на живых данных.

## Изменение количества и гонки

Интерфейс: `−  [ 24 ]  +`. Кнопки −10/+10 нет.

Каждое нажатие — одна запись в `change_history`. Ручной ввод числа фиксируется один раз (по Enter / потере фокуса).

Сервер принимает новое значение только если текущее совпадает со старым (**compare-and-swap**). Задержанный запрос со старым числом не затирает более новое.

Realtime: если Артур на телефоне сделал 24→23, Глеб видит 23 без перезагрузки.

## Локальный режим

Пока `config/config.js` пустой, сайт работает **в этом браузере** через localStorage. Так можно открыть UI сразу, до создания проекта Supabase. Для совместной работы и Realtime нужны ключи.

## Структура репозитория

```
index.html          рабочий экран
admin.html          визуальный конфигуратор
css/                стиль, админка, адаптив
js/                 модули без сборщика
config/             ключи Supabase (только anon)
supabase/           schema.sql, policies.sql, seed.sql, security_test.sql
```

## Установка

### 1. Создать проект Supabase

[https://supabase.com/dashboard](https://supabase.com/dashboard) → New project.

### 2. Выполнить SQL

В SQL Editor по очереди:

1. `supabase/schema.sql`
2. `supabase/policies.sql`
3. `supabase/seed.sql`

По желанию: `supabase/security_test.sql` — в логе должно быть `SECURITY TESTS PASSED`.

Если база уже была создана по предыдущей версии, повторно выполните **только** `schema.sql` и `policies.sql` (seed не запускать).

### 3. Ключи

Settings → API:

- Project URL
- `anon` `public` key

Скопировать `config/config.example.js` → `config/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJhbGciOi...",
};
```

`service_role` не вставлять и не коммитить.

### 4. Локальный запуск

Из корня репозитория:

```bash
python3 -m http.server 8080
```

Открыть http://localhost:8080

### 5–8. GitHub и Pages

1. Создать репозиторий (этот уже подходит).
2. Закоммитить код, в том числе заполненный `config/config.js` (anon key по задумке публичный).
3. Settings → Pages → Source: Deploy from a branch → `main` (или `docs`).
4. Сайт: `https://<user>.github.io/<repo>/`

Отдельная админка: `https://<user>.github.io/<repo>/admin.html`

## Как пользоваться

**Рабочий экран** — пароль `1980`, сотрудник, производство. Критический остаток подсвечивается, если количество ≤ минимума.

**Админка** — пароль `1432`. Можно:

- добавлять / удалять / переименовывать / менять порядок производств;
- то же для отделов, групп и позиций;
- управлять сотрудниками и их цветами.

На ПК порядок меняется перетаскиванием. На телефоне — кнопками ▲ ▼.

## Темы и устройства

Тёмная и светлая тема (кнопка ◐). Вёрстка под iPhone Safari, Android Chrome, планшет и ПК. Кнопки крупные, `touch-action: manipulation` на органах управления, чтобы убрать случайный double-tap zoom, не ломая прокрутку.

## Что сознательно не входит в MVP

Telegram, фото, Excel/PDF, сложные отчёты, push, PWA, мультиязычность.

## Дальнейшая замена на Supabase Auth

Менять нужно только `js/auth.js` (`login` / `restore` / `logout`) и RLS в `policies.sql`. Экраны, таблицы и админ-конфигуратор остаются.
