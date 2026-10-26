# Mobile readiness: a React Native client on the same API

The first release is a web app, but the API was built so a native client can use it unchanged. This document records:
- what already works for a native client;
- the one auth addition a client needs;
- how to handle time zones;
- what remains for push notifications.

Read it together with [CLAUDE.md §3.1](../CLAUDE.md) (the binding rules) and [API.md](API.md).

## What already works today

| Concern | Web app | Native client |
|---|---|---|
| Base URL | relative `/api/v1` (same origin) | absolute `https://<your-api>/api/v1`. Call Render (or a custom API domain) directly; no Vercel rewrite is needed |
| Authentication | `hf_session` HttpOnly cookie | `Authorization: Bearer <session token>`, already accepted by `requireAuth` |
| CSRF | `X-CSRF-Token` header on every write | **Not needed.** `csrfProtection` skips Bearer requests, because a native app can't be tricked into sending another site's request |
| Session lifetime | 30 days, sliding (cookie re-sent) | Same 30 days, sliding. `resolveSession` moves `expires_at` forward on use for Bearer too; there is just no cookie to refresh |
| Logout | `POST /auth/logout` | Same endpoint with the Bearer header. It deletes this session row immediately |
| Password change | Revokes all **other** sessions | Same. Other devices get `401 UNAUTHENTICATED` and must log in again |
| Workspaces | `X-Workspace-Id` header (personal workspace if absent) | Same header |
| Errors | `{ error: { code, message, details } }` | Same. Switch on `code`, show `message` |
| Pagination, dates | `?page&limit`, `YYYY-MM-DD` dates, UTC timestamps | Same |
| Offline-friendly writes | Optimistic UI | `PUT` / `DELETE /habits/:id/completions/:date` are **idempotent**, so an offline queue can replay them safely, in any order, any number of times. The last write per (habit, date) wins |

Rules a native client must follow:
1. **Never send cookies.** Use `credentials: 'omit'`, or a fetch library without a cookie jar. If a cookie and a Bearer token are both present, the **cookie wins** (CLAUDE.md §3.1), and then CSRF applies. Mixing them leads to confusing `403 CSRF_TOKEN_INVALID` errors.
2. Store the token in the platform's secure storage: Keychain on iOS, Keystore on Android (`expo-secure-store`). Never use AsyncStorage.
3. Treat any `401 UNAUTHENTICATED` as "logged out": delete the stored token and show the login screen. A wrong password at login is a different code (`INVALID_CREDENTIALS`), and so is a wrong current password in settings (`INVALID_CURRENT_PASSWORD`).

## The missing piece: a login that returns the token

Today `POST /auth/login` and `POST /auth/signup` deliver the session token **only** in the `Set-Cookie` header, as an HttpOnly cookie. That is right for browsers, but a native app shouldn't depend on reading cookies.

**Planned addition** (small and additive; it doesn't change the web flow):

```
POST /api/v1/auth/token          (rate-limited like login: 10 per 15 min per IP + email)
{ "email": "ana@example.com", "password": "…", "deviceName": "Ana's iPhone" }

200 { "user": { … }, "token": "<32-byte base64url>", "expiresAt": "2026-11-25T10:00:00.000Z" }
401 INVALID_CREDENTIALS          (same constant-time check as login)
```

Implementation notes for whoever builds it:

- **Reuse `authService.login()`**, which already verifies the password (with a dummy hash for unknown emails) and creates the session. Add a controller that returns the token in the JSON body and **sets no cookies**.
- **Store `deviceName`** in `sessions.user_agent`, or in a new nullable column, so a future "logged-in devices" screen can list sessions and revoke them one by one with a `DELETE /sessions/:id`.
- **Signup:** either add `POST /auth/signup` with `{ "issueToken": true }`, or have the app sign up and then call `/auth/token`.
- **Logging:** never log the token. The pino redaction already covers `token` keys (`config/logger.js`), and `tests/integration/logSecrets.test.js` should get a case for the new endpoint.
- **Bookkeeping:** document the endpoint in `docs/API.md` and `openapi.yaml`, and add it to the route-guard test's public list. It's public in the same way login is.

## Time zones

"Today" is computed on the server from `users.timezone`, an IANA zone (CLAUDE.md §3.1). Phones travel, so:

1. **On app start and on resume**, compare the device zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`, or `expo-localization`) with `user.timezone` from `GET /auth/me`.
2. If they differ, **ask the user** ("You're in Tokyo now. Use Tokyo time for your habits?") and save the answer with `PATCH /users/me { "timezone": "Asia/Tokyo" }`.
   - Don't switch silently: changing the zone changes which day counts as "today" and when reminders fire.
   - The web app warns about this too (Settings → Timezone).
3. To show a specific day regardless of zone, pass it explicitly: `GET /today?date=2026-10-26`. Writes always name their date (`PUT /habits/:id/completions/2026-10-26`), so they're unambiguous.
4. **A possible later addition:** an `X-Timezone` request header that overrides `users.timezone` for reads only (a `resolveTimezone` middleware next to `resolveWorkspace`). It isn't built. Asking the user (step 2) keeps one source of truth, and reminders must use the stored zone anyway.

## Push notifications: what remains

The delivery layer is already built so push can be added without touching the producers (the reminder scheduler and the milestones).

```
producers ─► dispatchNotification() ─► each channel in DEFAULT_CHANNELS
                (preferences, dedupe)      ├─ InAppChannel   (today: the notifications table)
                                           └─ PushChannel    (to build)
```

To build:

1. **A `device_tokens` table.** Write the migration as `.cjs`, name every constraint, and use one migration per table.

   | column | type | notes |
   |---|---|---|
   | `id` | uuid PK | `gen_random_uuid()` |
   | `user_id` | uuid FK → users | `ON DELETE CASCADE` (deleting an account removes its devices) |
   | `session_id` | uuid FK → sessions, nullable | `ON DELETE SET NULL`. Lets logout also drop the device |
   | `platform` | varchar + CHECK | `ios` / `android` / `web` (ADR-024: no native ENUM) |
   | `token` | text, **unique** | Expo, FCM or APNs push token |
   | `app_version`, `locale` | varchar, nullable | For debugging and future localisation |
   | `created_at`, `last_seen_at` | timestamptz | `last_seen_at` is refreshed on each registration |
   | `disabled_at` | timestamptz, nullable | Set when the provider reports the token as invalid |

   Indexes: `(user_id)` and the unique `(token)`.

2. **Endpoints** (Bearer-authenticated and user-scoped, like notifications):
   - `POST /devices { platform, token, appVersion }` is an upsert on `token`, which moves a re-used token to the current user.
   - `DELETE /devices/:id` removes one device.
   - Also delete the session's device on `POST /auth/logout`.

3. **`PushChannel extends NotificationChannel`** in `services/notifications/`:
   - `name = 'push'`.
   - `isEnabled(prefs)` returns `prefs.push !== false`. Add `push` to `notificationPreferences` (JSON, no migration needed) and to Settings in the web and mobile apps.
   - `send(notification)` loads the user's enabled `device_tokens` and sends through one provider. **Expo Push** is simplest for React Native; FCM and APNs work directly too.
   - On "token not registered" or "invalid", set `disabled_at`.
   - Register it in `DEFAULT_CHANNELS`. Dedupe stays at the producer level (`dedupe_key`), so one reminder still means one notification row and one push.

4. **Reliability:**
   - Push sending is network I/O. Keep it outside the scheduler's database transaction and add a per-send timeout, so one slow provider call can't delay the next minute's tick.
   - At larger scale, move sends to a queue (for example a `push_outbox` table drained by the scheduler process).

5. **Privacy:**
   - Push text shows on lock screens. Use the habit name only, which matches the current in-app copy, and never include notes.
   - Respect the existing `reminders: false` preference: it mutes reminders on every channel (ADR-042).

6. **Tests and docs:**
   - Unit tests for `PushChannel` with a fake provider.
   - An integration test that `dispatchNotification` fans out to both channels and respects preferences.
   - Route-guard coverage for `/devices`.
   - `docs/API.md` and `openapi.yaml` updated.

## Other notes for the mobile project

- **Rate limits.** They are counted per IP. Phones behind a carrier's shared IP (CGNAT) may share a bucket of 300 requests per 15 minutes. If that becomes a problem, key the general limiter by **user id** for authenticated requests (and keep per-IP for login and signup) in `middleware/rateLimit.js`.
- **Versioning.** Breaking changes go to `/api/v2`. Within v1, changes are additive only: new optional fields and new endpoints. Clients must ignore unknown JSON fields. Consider sending `X-Client-Version`, so old app versions can be identified in the logs.
- **Health and maintenance.** `GET /api/v1/health` is public and cheap, and a client can use it to tell "offline" from "server down".
