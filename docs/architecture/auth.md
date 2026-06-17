# Autenticação

## Estratégias Passport

| Strategy | Uso |
| --- | --- |
| `LocalStrategy` | `POST /auth/login` |
| `JwtStrategy` | Guard global (bypass via `@PublicAccess()`) |

## Tokens

- **Access:** JWT 15 min — payload `{ sub, email, role }`
- **Refresh:** UUID opaco, 7 dias, `bcrypt(10)` no User
- **Rotação:** refresh revoga token anterior e emite novo par

## Endpoints

| Método | Path | Guard |
| --- | --- | --- |
| POST | `/auth/register` | público |
| POST | `/auth/login` | LocalAuthGuard |
| POST | `/auth/refresh` | público |
| POST | `/auth/logout` | JwtAuthGuard |
| GET | `/auth/me` | JwtAuthGuard |

## Frontend

- **Admin:** cookie `access_token` + middleware Next.js
- **Web:** landing pública
