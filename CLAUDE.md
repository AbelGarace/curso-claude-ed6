# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

La documentación se escribe en español (docs, README, comentarios de documentación). El proyecto y su documentación ya están en español.

## Qué es

Resttek: plataforma de gestión de restaurantes. Monorepo con **npm workspaces** (`packages/*`): una API Node.js (`api`) y cuatro paquetes Angular 21 (`web-admin`, `web-empleados`, `web-clientes` y la librería `web-shared`). Requiere Node 22+ y npm 10+. Documentación detallada en `docs/` (`arquitectura/`, `dominio/`, `revisiones/`).

## Comandos

Todo se ejecuta desde la raíz:

```bash
npm install            # instala todos los workspaces (necesario para enlazar @resttek/web-shared)
npm run seed           # puebla SQLite (INSERT OR IGNORE, idempotente); imprime credenciales
npm run dev:api        # API en :3000 (tsx watch); healthcheck: GET /health
npm run dev:admin      # :4200
npm run dev:empleados  # :4201
npm run dev:clientes   # :4202
npm test               # solo tests de la API (vitest run)
```

- Test individual: `cd packages/api && npx vitest run src/services/order.service.test.ts` (o `-t "nombre del test"`). Modo watch: `npm run test:watch` en `packages/api`.
- Los frontends no tienen lint ni tests configurados en scripts; `build` con `npm run build -w @resttek/web-admin` (idem para los otros).
- Los frontends hacen proxy de `/api` hacia `localhost:3000` (`proxy.conf.json`). Los cambios en `web-shared` no se recargan en caliente: reinicia el servidor del frontend.
- Credenciales de seed: la contraseña de cada usuario es su propio email (p. ej. `admin@resttek.com`).
- `scripts/seed-issues.sh` crea issues de GitHub desde `scripts/issues.json` (requiere `gh` y `jq`); ver `scripts/README.md`.

## Arquitectura de la API (`packages/api`)

Express 5 + TypeScript (ESM) + SQLite (`sqlite3`). Rutas bajo `/api/v1` (salvo `/health`). Conviven **dos estilos**, hay que saber cuál aplica antes de tocar código:

1. **Hexagonal + DDD — solo el contexto `employee`** (`src/contexts/employee/{domain,application,infrastructure}`). `Employee` es la única entidad real (constructor privado + `create()`), con casos de uso de una sola acción (`execute()`), interfaces con prefijo `I` (`IEmployeeRepository`, `IAuthService`) y cableado de dependencias en `infrastructure/http/dependencies.ts`. `contexts/shared` contiene `Email`, middlewares y `errorHandler`.
2. **Por capas — `restaurant`, `dish`, `ingredient`, `order`**: carpetas transversales `models/`, `repositories/`, `services/`, `controllers/`, `routes/` con un fichero por dominio. Modelos son `interface` planas; la validación vive en servicios y en funciones `normalizeX()` de los modelos. La interfaz del repositorio (sin prefijo `I`) convive con su implementación `Sqlite*` en el mismo fichero. La composición de dependencias (repo → service → controller) se hace en el propio fichero `*.routes.ts`.

Detalles a tener en cuenta:

- Path aliases en `tsconfig.json` (`@services/*`, `@models/*`, `@employee/*`, `@shared/*`, `@errors/*`, etc.); los imports llevan extensión `.js`.
- La BD usa `:memory:` cuando `NODE_ENV=test`, si no, `packages/api/resttek.db`. Las tablas se crean al iniciar.
- Los repositorios mapean `snake_case` → `camelCase` con alias en el SQL. Los tests usan mocks en `repositories/mocks/` y `application/mocks/`.
- Routers montados bajo `/restaurants/:restaurantId/...` necesitan `Router({ mergeParams: true })`.
- Autorización con middlewares `authenticate` + `authorize([roles])` (roles: admin, manager, camarero, cocinero, cliente). `GET /restaurants` devuelve todos solo a admin; al resto, su propio restaurante.
- Existen rutas públicas (`/api/v1/public/restaurants...`) para la app de clientes.

## Arquitectura del frontend

Angular 21: standalone components, signals, **zoneless** (sin `zone.js`), guards/interceptors funcionales. Lo compartido (login, register, auth store/guard, interceptores HTTP, tokens y estilos base) vive en `@resttek/web-shared` (`packages/web-shared/src/index.ts`); ninguna app tiene `shared/` propia.

- `web-admin` y `web-empleados`: por feature (`features/<f>/{models,pages,services,store}`). Patrón **Store**: servicio `providedIn: 'root'` con signals privadas expuestas `asReadonly()`, trío `loading`/`error`/datos, conversión de `Observable` con `firstValueFrom`, y los componentes solo hablan con el store. `OrderStore` de empleados hace polling cada 30 s.
- `web-clientes`: estructura distinta (modelos/servicios/store en `core/`, raíz `App` en `app.ts`). Solo `CartStore` es un store (local, sin HTTP); el resto de componentes usan los servicios con `.subscribe()` directamente, y `my-orders` hace polling cada 10 s con `setInterval`.

## Notas

- `docs/revisiones/` recoge inconsistencias conocidas entre código y documentación; consúltalas antes de fiarte de un detalle de `docs/`.
