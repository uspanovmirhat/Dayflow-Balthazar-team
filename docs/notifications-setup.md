# Уведомления и вход через Google — настройка

Всё бесплатно: тариф Spark, без Cloud Functions.

## Как это работает

| Слой | Когда приходит | Что нужно |
| --- | --- | --- |
| Локальные уведомления | Пока Dayflow открыт (вкладка или установленное приложение, можно в фоне) | Ничего — нажать «Включить уведомления» на странице «Напоминания» |
| Push (FCM) | Даже когда Dayflow закрыт, на все устройства, где пользователь включил уведомления | VAPID-ключ + GitHub Actions (ниже) |

- Код: `src/backend/services/notification.service.ts`, `public/sw.js`, страница `RemindersPage` в `src/App.tsx`.
- Push отправляет `scripts/send-reminders.mjs`, его запускает `.github/workflows/reminders.yml` каждые 5 минут.
  GitHub иногда запускает cron с опозданием на 5–15 минут, поэтому push может прийти чуть позже. Пока Dayflow открыт, локальное уведомление приходит точно вовремя, а дубль не показывается (общий ключ `reminderId:дата:время`).
- Напоминание, привязанное к привычке, не приходит, если привычка уже выполнена сегодня. Привязанное к задаче не приходит, когда задача выполнена.
- Устройства хранятся в `users/{uid}/devices/{deviceId}`. Отправленные напоминания записываются в `notificationLog/{uid}__{key}`: туда пишет только Admin SDK, клиенту доступ закрыт.

## 1. Вход через Google

1. Firebase console → Authentication → Sign-in method → Google → **Enable** (уже включено).
2. Authentication → Settings → **Authorized domains**: там должны быть `localhost` и домен хостинга (`<project>.web.app`). Если сайт открывается с другого домена, добавьте его тоже.

Если popup заблокирован (часто в мобильных браузерах), вход автоматически переключается на redirect.

## 2. Push при закрытом сайте

1. Firebase console → Project settings → **Cloud Messaging** → Web configuration → Web Push certificates → **Generate key pair**.
2. Скопируйте ключ в `.env.local`:
   ```
   VITE_FIREBASE_VAPID_KEY=B...ключ...
   ```
3. Задеплойте правила и сайт:
   ```sh
   npm run build
   npx firebase deploy --only firestore:rules,hosting
   ```
4. Firebase console → Project settings → **Service accounts** → Generate new private key. Скачается JSON. **Никому не отправляйте и не коммитьте его.**
5. GitHub → репозиторий → Settings → Secrets and variables → Actions:
   - **Secrets** → New repository secret: `FIREBASE_SERVICE_ACCOUNT` = всё содержимое JSON-файла;
   - **Variables** → New repository variable: `APP_URL` = `https://<project>.web.app` (адрес, который откроется по клику на уведомление).
6. Влейте ветку в `main`: GitHub запускает cron только из ветки по умолчанию. Проверка: Actions → «Send reminder notifications» → **Run workflow**.

Для публичного репозитория GitHub Actions бесплатен без лимита. Если репозиторий не обновлялся 60 дней, GitHub отключает cron. Включается обратно кнопкой в Actions.

Необязательно: Firestore → TTL policies → коллекция `notificationLog`, поле `expireAt`. Тогда старые записи удаляются сами.

## Устройства

- **Android, Windows, macOS, Linux** (Chrome, Edge, Firefox): открыть сайт → «Напоминания» → «Включить уведомления».
- **iPhone/iPad** (iOS 16.4+): Safari → «Поделиться» → «На экран „Домой“», открыть Dayflow с иконки и уже там включить уведомления. В обычной вкладке Safari web-push не работает.
- Включать нужно на каждом устройстве, где вошли в аккаунт. При выходе из аккаунта устройство отписывается.
