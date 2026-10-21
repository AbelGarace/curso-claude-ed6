# Plan: Corrección de vulnerabilidades OWASP Top 10 (API y web-empleados)

- **Tipo:** bug
- **Fecha:** 2026-10-21
- **Estado:** pendiente

## 1. Resumen

La auditoría de `packages/api` y `packages/web-empleados` (+ `web-shared`) ha encontrado 1 vulnerabilidad crítica, varias altas y otras medias y bajas del OWASP Top 10. Las más graves son el control de acceso roto en pedidos y en los recursos de otros restaurantes (IDOR multi-tenant) y el secreto JWT por defecto. Este plan las corrige por fases, de mayor a menor severidad.

## 2. Contexto y objetivo

**Situación actual (verificada por los subagentes de auditoría, pendiente de reconfirmar al implementar cada tarea):**

- Las rutas de `order.routes.ts` usan solo `authenticate`. Cualquier usuario autenticado (incluido un `cliente` que se registre en `/auth/register`) puede listar pedidos de cualquier restaurante, leer cualquier pedido y cambiar el estado de cualquier ítem.
- `authorize` valida el rol, pero nada compara `req.params.restaurantId` con `req.user.restaurantId`. Los repositorios de platos e ingredientes buscan solo por `id`.
- `JWT_SECRET` tiene el valor por defecto `'super-secret-resttek-key'`, duplicado en `middlewares.ts` y `BcryptAuthService.ts`.
- No hay rate limiting, política de contraseñas, `helmet` ni CORS restringido. `quantity` no se valida en los pedidos.
- En el frontend, `authGuard` solo comprueba que haya token. El rol y el `restaurantId` se leen de `localStorage` sin validar, y no hay CSP.

**Resultado esperado:** ningún usuario puede leer o modificar datos de otro restaurante ni actuar fuera de su rol. La API no arranca sin secreto JWT. Las entradas se validan y los errores internos no se filtran. Los frontends validan el rol en el cliente (solo como UX; la autoridad es la API).

## 3. Alcance

**Incluye:**

- Fases 1-4: correcciones de la API (acceso, secreto JWT, autenticación, validación, configuración, logging).
- Fase 8: refresh token con rotación (token Bearer de acceso corto + refresh), logout con revocación y DTO público sin datos sensibles.
- El rol `admin` ve los pedidos de todos los restaurantes (decisión confirmada).
- Fase 5: dependencias (`npm audit`).
- Fase 6: correcciones de `web-empleados` y `web-shared` (guards de rol, validación de sesión, CSP, interceptores).
- Fase 7: higiene del repositorio y documentación.
- Tests de vitest (TDD) para toda la lógica nueva de la API, con los mocks existentes.

**No incluye:**

- Migrar el token a cookie `HttpOnly`: se mantiene el token Bearer (decisión confirmada). El riesgo de robo por XSS se mitiga con CSP, expiración corta y refresh con rotación.
- Los frontends `web-admin` y `web-clientes` no se modifican en su código propio. Comparten `web-shared`, así que los cambios allí les afectan y deben probarse.

## 4. Diseño de la solución

**Control de acceso (H-01, H-02, H-06):**

- Nuevo middleware `authorizeRestaurant` en `contexts/shared/infrastructure/http/middlewares.ts`. Deja pasar si `user.role === 'admin'` o `user.restaurantId === req.params.restaurantId`. Si no, responde 403. Se aplica a todos los routers montados bajo `/restaurants/:restaurantId/...`.
- Los repositorios `dish` e `ingredient` pasan a recibir `restaurantId` en `getById`, `update` y `delete` (`WHERE id = ? AND restaurant_id = ?`). Una combinación que no coincida devuelve "no encontrado" (404).
- Pedidos:
  - `GET /orders/active` y `PATCH /orders/:orderId/items/:itemId/status` exigen `authorize(['admin','manager','camarero','cocinero'])`. Para manager, camarero y cocinero, el `restaurantId` se toma del token y se ignora el de la query. El `admin` (sin restaurante propio) ve los pedidos de todos los restaurantes: sin `restaurantId` en la query los lista todos, y con él filtra por ese restaurante. El `cliente` no accede a estas rutas.
  - El `admin` puede leer cualquier pedido (`GET /orders/:id`). Para `PATCH` de estado se le trata como manager (todas las transiciones).
  - `GET /orders/:id` solo para el cliente propietario o el personal del mismo restaurante. Si no, responde 404, para no confirmar que el pedido existe.
  - `PATCH` valida que el pedido pertenezca al restaurante del token. Se limitan las transiciones de estado por rol: cocinero → `preparando`/`listo`; camarero → `entregado`; manager → todas.
- `GET /restaurants/:id` verifica pertenencia, salvo para `admin`.
- `GET /employees`: `limit` máximo 100. `POST /employees` valida que el restaurante exista.

**Secreto JWT y autenticación (H-04, H-03, H-10, H-11):**

- Nuevo módulo `config/jwt.ts` que lee `JWT_SECRET` una sola vez y lanza error al importarse si falta o tiene menos de 32 caracteres. Excepción: con `NODE_ENV=test` se usa un secreto fijo de test. `middlewares.ts` y `BcryptAuthService.ts` lo importan. `jwt.verify` usa `algorithms: ['HS256']`.
- Los scripts de desarrollo (`npm run dev:api`, `seed`) necesitan `JWT_SECRET`. Se documenta un `.env.example` y se carga con `--env-file` de Node 22 o con una variable en el script.
- `express-rate-limit` en `/auth/login` y `/auth/register`: por IP, y por email en login.
- Política de contraseñas en `RegisterClientUseCase` y `CreateEmployeeUseCase`: mínimo 8 caracteres. Solo se aplica al crear o registrar usuarios, no al login, para no romper el seed existente. Ver sección 7.
- Login: `bcrypt.compare` contra un hash ficticio si el usuario no existe. El email se normaliza a minúsculas en `Email.ts`.
- Register: se mantiene el error de email duplicado (necesidad de UX) y se protege con rate limiting. Alternativa en sección 7.
- Tokens (decisión confirmada: se mantiene el token Bearer):
  - El access token JWT pasa de 8 h a 15 min.
  - El refresh token es un valor aleatorio opaco (32 bytes), de 7 días. Solo se guarda su hash SHA-256 en una tabla nueva `refresh_tokens` (`id`, `employee_id`/`user_id`, `token_hash`, `family_id`, `expires_at`, `revoked_at`, `replaced_by`). El SQL va solo en el repositorio, con sentencias preparadas.
  - `POST /auth/refresh` rota el token: revoca el usado y emite un par nuevo. Si se presenta un refresh ya usado (reutilización), se revoca toda su familia y se responde 401.
  - `POST /auth/logout` revoca el refresh token. `/auth/refresh` y `/auth/logout` tienen rate limiting.
  - Al cambiar el rol o borrar a un empleado, se revocan sus refresh tokens. Así la degradación surte efecto en 15 min como máximo.
  - Frontend: `AuthStore` guarda el refresh token junto al access token en `localStorage`. El interceptor, ante un 401, llama a refresh una sola vez y reintenta la petición; las peticiones concurrentes esperan al mismo refresh. Si falla, cierra sesión. La CSP (T34) mitiga el robo por XSS.
- Datos públicos: el DTO de `GET /public/restaurants` y `GET /public/restaurants/:id` deja de incluir `email`, `phone` y los datos del propietario (`restaurant.controller.ts:276-288`). Se crea un DTO público aparte del DTO privado y solo se exponen los campos que usa `web-clientes`.

**Validación y errores (H-07, H-09, H-13):**

- `order.service`: `items` debe ser un array no vacío (máximo 50 ítems). `quantity` es un entero entre 1 y 50. Cada `dishId` debe pertenecer al `restaurantId` y estar disponible. `tableId` se valida contra el restaurante.
- Los controladores de pedidos usan `next(error)` y el `errorHandler` compartido. Los errores de SQLite no se devuelven al cliente: respuesta genérica y detalle solo en el log del servidor.
- `errorHandler` registra los errores 5xx. Se registran los 401/403 y los intentos de login fallidos con un logger mínimo (`console` estructurado; sin nueva dependencia). JSON malformado → 400.

**Configuración (H-08):** `helmet()`, `app.disable('x-powered-by')`, `cors({ origin: lista blanca desde env CORS_ORIGINS })` con los tres frontends de desarrollo por defecto, `express.json({ limit: '100kb' })`.

**Frontend (A-1, M-2, M-3, B-1, B-2, B-3, B-5):**

- `web-shared`:
  - `roleGuard(roles)` funcional.
  - `AuthStore`: `JSON.parse` en try/catch, usuario tipado, y comprobación de `exp` del JWT en `isAuthenticated`.
  - `authInterceptor` solo adjunta el token si la URL empieza por la `apiUrl`.
  - `errorInterceptor` trata el 403 y elimina el flag global frágil.
  - Utilidad para mapear `HttpErrorResponse` a mensajes por status.
- `web-empleados`:
  - Rutas `/cocina`, `/barra` y `/salon` con `roleGuard`. La ruta `''` redirige a `defaultRoute` según rol.
  - El `OrderStore` para el polling ante 401/403 y usa los mensajes mapeados.
  - CSP con `security.autoCsp` en `angular.json`. Hay que verificar que no rompe los estilos ni el arranque.
- El rol del token sigue siendo informativo en el cliente. La autoridad es la API (Fases 1-2).
- Dependencias: subir `@angular/*` a la última 21.2.x y ejecutar `npm audit fix`. Comprobar la compilación de los tres frontends.

### Archivos afectados

| Archivo | Acción | Cambio |
| ------- | ------ | ------ |
| `packages/api/src/config/jwt.ts` | crear | Lectura única y validación de `JWT_SECRET` |
| `packages/api/src/contexts/shared/infrastructure/http/middlewares.ts` | modificar | Usa `jwt.ts`, HS256, `authorizeRestaurant`, logging 401/403 |
| `packages/api/src/contexts/employee/infrastructure/BcryptAuthService.ts` | modificar | Usa `jwt.ts`, expiración 2 h |
| `packages/api/src/routes/order.routes.ts` | modificar | `authorize` por rol y por transición |
| `packages/api/src/controllers/order.controller.ts` | modificar | `restaurantId` del token, `next(error)` |
| `packages/api/src/services/order.service.ts` | modificar | Validación de entrada y pertenencia |
| `packages/api/src/routes/{dish,ingredient,restaurant}.routes.ts` | modificar | `authorizeRestaurant` |
| `packages/api/src/repositories/{dish,ingredient}.repository.ts` | modificar | Filtro por `restaurant_id` |
| `packages/api/src/repositories/mocks/*` | modificar | Adaptar mocks a las nuevas firmas |
| `packages/api/src/contexts/employee/infrastructure/http/{auth.routes,EmployeeController}.ts` | modificar | Rate limiting, tope de `limit` |
| `packages/api/src/contexts/employee/application/{LoginUseCase,RegisterClientUseCase,CreateEmployeeUseCase}.ts` | modificar | Timing, contraseña mínima, restaurante existente |
| `packages/api/src/contexts/shared/domain/Email.ts` (ruta a confirmar) | modificar | Normalizar a minúsculas |
| `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts` | modificar | Logging y 400 en JSON malformado |
| `packages/api/src/app.ts` | modificar | helmet, CORS, límite de body, x-powered-by |
| `packages/api/package.json`, `package.json` | modificar | Dependencias nuevas y actualizadas |
| `.env.example` | crear | Variables requeridas |
| `.gitignore` | modificar | `*.db`, `.env*`, `.DS_Store`, `.angular/` |
| `packages/web-shared/src/lib/auth/{auth.guard,auth.store}.ts` | modificar | `roleGuard`, validación de sesión y `exp` |
| `packages/web-shared/src/lib/http/{auth,error}.interceptor.ts` | modificar | Token solo a la API, manejo de 403 |
| `packages/web-shared/src/index.ts` | modificar | Exportar `roleGuard` |
| `packages/web-empleados/src/app/app.routes.ts` | modificar | Guards de rol y redirect por rol |
| `packages/web-empleados/src/app/features/orders/store/order.store.ts` | modificar | Parar polling, mensajes de error |
| `packages/web-empleados/angular.json` | modificar | `security.autoCsp` |
| `docs/arquitectura/*`, `CLAUDE.md`, `README.md` | modificar | Seguridad, variables de entorno |

## 5. Tareas

Cada tarea debe poder completarse en 5-10 minutos. En la API se sigue TDD: primero el test que falla (vitest) y luego el código.

### Fase 1 — Crítica: control de acceso en pedidos (H-01)

- [ ] **T1** (~10 min) — Test y middleware `authorizeRestaurant` (admin pasa; mismo restaurante pasa; otro restaurante → 403) · `middlewares.ts`
- [ ] **T2** (~10 min) — Tests de `OrderService`: listado activo filtra por restaurante del token y `getById` devuelve 404 si no es propietario o personal del mismo restaurante · `order.service.test.ts`
- [ ] **T3** (~10 min) — Implementar en `OrderService` el filtrado por restaurante y la propiedad en `getById` · `order.service.ts`
- [ ] **T4** (~10 min) — Tests e implementación de transiciones de estado por rol en `updateItemStatus` y pertenencia del pedido al restaurante · `order.service.ts`
- [ ] **T5** (~10 min) — Controlador: tomar `restaurantId` y `role` del token, ignorar la query, usar `next(error)` · `order.controller.ts`
- [ ] **T6** (~5 min) — Añadir `authorize` por rol a `/active` y a `PATCH`; verificar con curl · `order.routes.ts`

### Fase 2 — Alta: IDOR multi-tenant y secreto JWT (H-02, H-04)

- [ ] **T7** (~10 min) — Tests de repositorio mock/servicio de platos: `getById`, `update` y `delete` con `restaurantId` ajeno → no encontrado · `dish.service.test.ts`
- [ ] **T8** (~10 min) — Repositorio de platos: `WHERE id = ? AND restaurant_id = ?` y propagar `restaurantId` por servicio y controlador · `dish.repository.ts`, `dish.service.ts`, `dish.controller.ts`
- [ ] **T9** (~10 min) — Lo mismo para ingredientes (tests + repositorio + servicio + controlador) · `ingredient.*`
- [ ] **T10** (~5 min) — Aplicar `authorizeRestaurant` en `dish.routes.ts` e `ingredient.routes.ts` · `routes/`
- [ ] **T11** (~10 min) — Proteger `GET/PUT /restaurants/:id` con comprobación de pertenencia salvo admin (test + ruta/controlador); comprobar que `GET /restaurants` sigue igual · `restaurant.routes.ts`
- [ ] **T12** (~10 min) — Crear `config/jwt.ts` (test: falla sin secreto o con menos de 32 caracteres; secreto fijo en `NODE_ENV=test`) · `config/jwt.ts`
- [ ] **T13** (~10 min) — Sustituir los dos secretos duplicados por `jwt.ts`, fijar `algorithms: ['HS256']` y expiración 2 h; test de rechazo de un token firmado con otro algoritmo · `middlewares.ts`, `BcryptAuthService.ts`
- [ ] **T14** (~5 min) — Crear `.env.example` y ajustar los scripts `dev:api` y `seed` para cargar `JWT_SECRET`; documentarlo en README · `.env.example`, `package.json`

### Fase 3 — Alta/Media: autenticación y validación (H-03, H-10, H-07, H-06)

- [ ] **T15** (~10 min) — Tests e implementación de contraseña mínima (8 caracteres) en `RegisterClientUseCase` y `CreateEmployeeUseCase` · `application/`
- [ ] **T16** (~10 min) — Test e implementación de `bcrypt.compare` ficticio en `LoginUseCase` cuando el usuario no existe · `LoginUseCase.ts`
- [ ] **T17** (~5 min) — Normalizar el email a minúsculas en `Email` (test incluido). Revisar que el seed sigue funcionando · `Email.ts`
- [ ] **T18** (~10 min) — Instalar `express-rate-limit` y aplicarlo a `/auth/login` y `/auth/register` (por IP y, en login, por email); test con supertest si ya está disponible, si no, verificación manual · `auth.routes.ts`
- [ ] **T19** (~10 min) — Tests e implementación de validación en `createOrder`: `items` array no vacío (máx. 50), `quantity` entero entre 1 y 50 · `order.service.ts`
- [ ] **T20** (~10 min) — Validar que cada `dishId` pertenece al `restaurantId` y está disponible, y que `tableId` es válido (tests con mocks) · `order.service.ts`
- [ ] **T21** (~5 min) — Tope de `limit` (100) en `listEmployees` y validación de que el restaurante existe en `createEmployee` (tests) · `EmployeeController.ts`, `CreateEmployeeUseCase.ts`

### Fase 4 — Media/Baja: configuración, errores y logging (H-08, H-09, H-13)

- [ ] **T22** (~10 min) — Instalar `helmet`; configurar CORS con lista blanca desde `CORS_ORIGINS`, `x-powered-by` y límite del body en `app.ts` · `app.ts`
- [ ] **T23** (~10 min) — `errorHandler`: registrar 5xx, devolver 400 en JSON malformado y no devolver mensajes de SQLite (test) · `errorHandler.ts`
- [ ] **T24** (~10 min) — Logging de seguridad: 401/403 en middlewares y login fallido, sin registrar contraseñas ni tokens · `middlewares.ts`, `LoginUseCase.ts`

### Fase 5 — Alta: dependencias (H-05, A-3)

- [ ] **T25** (~10 min) — `npm audit` en la raíz; `npm audit fix` (sin `--force`) y ejecutar `npm test` · `package-lock.json`
- [ ] **T26** (~10 min) — Subir `@angular/*` a la última 21.2.x en los workspaces y compilar `web-admin`, `web-empleados` y `web-clientes` · `package.json`
- [ ] **T27** (~10 min) — Evaluar `sqlite3` 6.x: probar en una rama, ejecutar `npm test` y el seed; si falla, dejar el aviso documentado (la cadena afecta a instalación, no a ejecución) · `packages/api/package.json`

### Fase 6 — Frontend (A-1, M-2, M-3, B-1…B-5)

- [ ] **T28** (~10 min) — `AuthStore`: `JSON.parse` con try/catch, usuario tipado y lectura del `exp` del JWT en `isAuthenticated` · `auth.store.ts`
- [ ] **T29** (~10 min) — Crear `roleGuard(roles)` funcional y exportarlo; el guard de autenticación cierra sesión si el token ha caducado · `auth.guard.ts`, `index.ts`
- [ ] **T30** (~10 min) — Aplicar `roleGuard` en `/cocina` (cocinero, manager), `/barra` y `/salon` según rol, y redirección inicial con `defaultRoute` · `app.routes.ts`, `shell.component.ts`
- [ ] **T31** (~5 min) — `authInterceptor`: adjuntar el token solo si `req.url` empieza por la `apiUrl` · `auth.interceptor.ts`
- [ ] **T32** (~10 min) — `errorInterceptor`: tratar el 403 y quitar el flag global `isRedirecting` · `error.interceptor.ts`
- [ ] **T33** (~10 min) — Utilidad de mensajes por status y uso en `OrderStore`; detener el polling ante 401/403 · `order.store.ts`
- [ ] **T34** (~10 min) — Activar `security.autoCsp` en `angular.json`, compilar, abrir la app y comprobar que no hay violaciones de CSP en la consola · `angular.json`
- [ ] **T35** (~5 min) — Documentar en el proxy que `secure:false` es solo para desarrollo · `proxy.conf.json` o README

### Fase 7 — Cierre

- [ ] **T36** (~5 min) — `.gitignore`: añadir `*.db`, `.env*`, `.DS_Store`, `.angular/` · `.gitignore`
- [ ] **T37** (~10 min) — Prueba end-to-end con curl y navegador (sección 6) y `npm test` completo
- [ ] **T38** (~10 min) — Actualizar documentación: `CLAUDE.md` (autorización, tokens, variables de entorno), `README.md` y `docs/arquitectura/`; anotar en `docs/revisiones/` lo pendiente · `docs/`

### Fase 8 — Decisiones confirmadas: admin, refresh token y datos públicos

Las tareas T1-T6 deben incluir el rol `admin` según la sección 4. Se implementan T39-T49 antes del cierre (T36-T38).

- [ ] **T39** (~5 min) — Ajustar T3, T5 y T6: el admin lista todos los pedidos (o filtra por `restaurantId`), lee cualquiera y actualiza estado como manager; añadir tests · `order.service.ts`, `order.controller.ts`, `order.routes.ts`
- [ ] **T40** (~10 min) — Tabla `refresh_tokens` y repositorio (interfaz + `Sqlite*`, mock) con hash SHA-256; tests · `repositories/refresh-token.repository.ts`
- [ ] **T41** (~10 min) — Test y caso de uso de emisión de refresh token en login; respuesta con `accessToken` (15 min) y `refreshToken` · `LoginUseCase.ts`, `BcryptAuthService.ts`
- [ ] **T42** (~10 min) — Test y caso de uso `RefreshTokenUseCase` con rotación · `application/`
- [ ] **T43** (~10 min) — Test y detección de reutilización: revocar la familia y devolver 401 · `RefreshTokenUseCase.ts`
- [ ] **T44** (~10 min) — Rutas `POST /auth/refresh` y `POST /auth/logout` con rate limiting; revocar tokens al cambiar rol o borrar empleado · `auth.routes.ts`, `EmployeeController.ts`
- [ ] **T45** (~10 min) — `AuthStore` y `AuthService` del frontend: guardar y borrar el refresh token; logout llama a la API · `auth.store.ts`, `auth.service.ts`
- [ ] **T46** (~10 min) — Interceptor de refresh: ante 401 refresca una vez, reintenta y encola las peticiones concurrentes; si falla, cierra sesión · `error.interceptor.ts`
- [ ] **T47** (~10 min) — Crear el DTO público de restaurante sin `email`, `phone` ni propietario, con test · `restaurant.controller.ts`
- [ ] **T48** (~5 min) — Comprobar en `web-clientes` que ningún componente usa los campos retirados; ajustar si es necesario · `packages/web-clientes/`
- [ ] **T49** (~5 min) — Probar el flujo con curl y navegador: expiración del access token, rotación, reutilización y logout

## 6. Verificación

El proyecto tiene tests de vitest en la API (`npm test`); el frontend se comprueba a mano. Resultados esperados:

- **H-01:** con un token de `cliente`, `GET /api/v1/orders/active?restaurantId=<id>` → 403. Con un token de cocinero del restaurante A, pedir pedidos del B devuelve solo los del A. `PATCH` sobre un ítem de otro restaurante → 404. Un cocinero que intenta `entregado` → 403.
- **H-02:** un manager de A con `PUT/DELETE /restaurants/B/dishes/<id de B>` → 403. Con `restaurantId` de A y plato de B → 404.
- **H-04:** arrancar sin `JWT_SECRET` → el proceso termina con error claro. Un token forjado con el secreto antiguo → 401.
- **H-03:** más de N intentos de login seguidos → 429. Registrar con contraseña de 3 caracteres → 400.
- **H-07:** `POST /orders` con `quantity: 1000000000` → 400 sin carga en CPU.
- **H-08:** cabeceras de `helmet` presentes, sin `X-Powered-By`; petición con `Origin` no permitido sin cabecera CORS.
- **H-09:** `POST /orders` con `dishId` inexistente → error genérico, sin mensaje de SQLite.
- **Frontend:** un camarero que abre `/cocina` por URL es redirigido a su vista. Con `auth_user` corrupto en localStorage, la app va a login sin romperse. Con un token caducado, el guard redirige a login. La consola no muestra violaciones de CSP. Los tres frontends compilan.
- **Regresión:** el seed sigue funcionando y los flujos de admin, manager, camarero, cocinero y cliente funcionan.

## 7. Riesgos y dudas abiertas

- **Breaking change:** la API exigirá `JWT_SECRET` para arrancar y los tokens existentes dejarán de ser válidos al cambiar el secreto. Los scripts de desarrollo y el README deben actualizarse en la misma entrega.
- **Breaking change:** para manager, camarero y cocinero, `GET /orders/active` ignora el `restaurantId` de la query, y las rutas de pedidos de personal rechazan al `cliente`. El `admin` conserva el acceso a todos los restaurantes.
- **Breaking change:** la respuesta de login cambia (`accessToken` + `refreshToken`) y el access token caduca en 15 min. Hay que actualizar `web-shared` y comprobar `web-admin` y `web-clientes`, que comparten login.
- **Breaking change:** las rutas públicas de restaurantes dejan de devolver `email`, `phone` y propietario.
- **Breaking change:** los repositorios de platos e ingredientes cambian de firma; hay que adaptar los mocks y los tests.
- **Decidido:** el admin ve todos los pedidos; se mantiene el token Bearer con refresh y CSP; se ocultan los datos sensibles en las rutas públicas.
- **Riesgo residual:** el token sigue en `localStorage`, así que un XSS podría robarlo. Se mitiga con CSP, access token de 15 min y rotación del refresh con detección de reutilización. Un refresh robado queda invalidado en cuanto la víctima lo use.
- **Decidido:** se mantiene el aviso de email duplicado en `/auth/register`, protegido con rate limiting. Una respuesta genérica exigiría verificación por correo, que el proyecto no tiene. Si se añade correo transaccional, conviene revisarlo.
- **Riesgo:** la contraseña mínima de 8 caracteres puede chocar con los datos del seed o con tests existentes; se aplica solo al crear usuarios. Los usuarios del seed (contraseña = email) deben cambiarse en cualquier entorno real; el seed nunca debe ejecutarse en producción.
- **Riesgo:** subir `@angular/*` y `sqlite3` puede romper compilaciones; se prueba en rama aparte y sin `--force`.
- **Riesgo:** `autoCsp` puede bloquear estilos en línea; se verifica en T34.
- **Nota:** los hallazgos proceden de los informes de los subagentes y se contrastaron solo en parte. Al empezar cada tarea hay que reconfirmar el código actual (los números de línea pueden haber cambiado).

## 8. Documentación a actualizar

- `CLAUDE.md`: modelo de autorización (`authorizeRestaurant`, restricciones de pedidos), variables de entorno (`JWT_SECRET`, `CORS_ORIGINS`) y política de contraseñas.
- `README.md`: puesta en marcha con `.env`.
- `docs/arquitectura/`: sección de seguridad.
- `docs/revisiones/`: pendientes (cookie `HttpOnly`, revocación de tokens, datos públicos de restaurantes).
