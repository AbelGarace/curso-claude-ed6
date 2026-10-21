---
name: plan-implement
description: Implementa un plan generado con plan-feature (docs/plans). Trabaja en un git worktree propio (uno por agente si se reparte por aplicaciones), crea una rama por tarea desde develop, aplica TDD estricto, prueba la tarea levantando el proyecto, hace commit y marca la tarea como hecha. Úsala cuando el usuario adjunte un plan y pida implementarlo.
argument-hint: <ruta del plan en docs/plans> [tarea concreta, p. ej. T3]
allowed-tools: Bash(git:*), Bash(node:*), Bash(npm:*), Bash(curl:*), mcp__slack__slack_post_message
---

# plan-implement

Implementa, tarea a tarea, un plan creado con la skill `plan-feature`.

Argumentos del usuario: $ARGUMENTS

## Requisitos previos

1. **El usuario debe adjuntar el plan.** El primer argumento debe ser la ruta de un archivo dentro de `docs/plans/`. Si falta, no es un archivo existente o está fuera de `docs/plans/`, pídeselo con `AskUserQuestion` y no continúes sin él.
2. Lee el plan completo y comprueba que sigue la estructura de la plantilla (sección "Tareas" con casillas `- [ ] **Tn**`). Si todas las tareas ya están marcadas `- [x]`, avisa y detente.
3. Comprueba con `git status --short` que el árbol de trabajo está limpio. Si hay cambios sin commitear, avisa al usuario y detente: no los mezcles con las ramas de las tareas.
4. Si el usuario indica una tarea concreta (`T3`), implementa solo esa. Si no, implementa todas las pendientes, en orden y de una en una.

## Preparar la rama `develop`

1. Comprueba si existe `develop` (`git branch --list develop`).
2. Si no existe, créala desde `main`: `git branch develop main`. Si `main` tampoco existe (puede que la rama principal se llame `master`), usa la rama principal que exista, díselo al usuario y no la renombres.
3. No hagas `push` en ningún momento: todo el trabajo es local.

## Preparar el git worktree

Los cambios **nunca se hacen en el directorio de trabajo principal**: se hacen en un `git worktree` aislado, para no tocar el checkout del usuario.

0. **Ignora la carpeta de worktrees en local.** Antes de crear ninguno, comprueba si `.claude/worktrees/` está en `.git/info/exclude` y, si no, añádela (`echo '.claude/worktrees/' >> .git/info/exclude`). Así los worktrees no aparecen como cambios sin commitear ni se cuelan en un commit, y no se modifica el `.gitignore` del proyecto.
1. **Un worktree por defecto.** Créalo dentro de la carpeta `.claude/worktrees/` del repositorio: `git worktree add -b <tipo>/<slug-del-plan> .claude/worktrees/<slug-del-plan> develop`. La rama `<tipo>/<slug-del-plan>` es la **rama de integración** del plan (sustituye a `develop` como destino de las integraciones, ver "Integrar"). `develop` no puede estar desprotegida en dos worktrees a la vez, por eso no se usa directamente.
2. **Varios agentes, uno por aplicación.** Si el plan afecta a varias aplicaciones (p. ej. `api`, `web-admin`, `web-empleados`, `web-clientes`) y el usuario pide que las implementen varios agentes, cada uno una app, crea **un worktree y una rama de integración por agente**, todos desde `develop`: `git worktree add -b <tipo>/<slug-del-plan>-<app> .claude/worktrees/<slug-del-plan>-<app> develop`. Cada agente trabaja solo en su worktree y solo en los ficheros de su app; no comparten ramas ni directorios. Si dos apps dependen una de otra (p. ej. un frontend necesita un endpoint de la API), respeta el orden de dependencias del plan y avisa al usuario en lugar de tocar el worktree de otro agente.
3. Si el worktree o la rama ya existen (`git worktree list`, `git branch --list`), pregunta al usuario si reutilizarlos. No los borres ni los recrees.
4. Dentro del worktree ejecuta `npm install` (los `node_modules` no se comparten) antes de la primera prueba.
5. **Todos los comandos posteriores** (git, tests, arranque de la API, commits) se ejecutan dentro del worktree correspondiente. Al lanzar subagentes, indícales explícitamente la ruta de su worktree.
6. Al terminar **no elimines los worktrees** (`git worktree remove`): el usuario los revisará y los limpiará.

## Preparar el entorno de tests (solo la primera vez)

El proyecto no tiene tests ni linter. Usa el **test runner nativo de Node** (`node:test` y `node:assert`), sin instalar dependencias:

- Los tests van en `tests/`, en archivos `*.test.js` (en español, igual que el resto del código).
- Si `package.json` aún tiene el script `test` por defecto, cámbialo a `node --test tests/` en la primera tarea que necesite tests, y incluye ese cambio en su commit.
- Los tests que toquen la BBDD deben usar un fichero temporal mediante `DB_PATH` (por ejemplo, en el directorio temporal del sistema) y establecer `JWT_SECRET` si hacen falta tokens. Nunca contra `vendehumos.db`.
- Las dependencias externas siguen prohibidas para la BBDD.

## Bucle por tarea

Repite lo siguiente para cada tarea, **de una en una y sin empezar la siguiente hasta terminar la anterior**:

### 1. Rama de la tarea

- Estando en el worktree, parte siempre de su rama de integración actualizada: `git switch <rama-de-integración>` y, desde ahí, `git switch -c <rama>`.
- Nombre de la rama: `<tipo>/<slug-del-plan>/<tn>-<slug-tarea>` en minúsculas, kebab-case y sin tildes. El tipo es `feat` o `fix` según el plan y el slug del plan es el nombre del archivo sin fecha ni prefijo (por ejemplo `feat/vendehumos-usuario-alta/t4-insert-usuario-id`).
- Si la rama ya existe, pregunta al usuario si continuar en ella o no. No la borres ni la recrees.

### 2. TDD estricto (rojo → verde → refactor)

1. **Rojo:** escribe primero el test que describe el comportamiento de la tarea. Ejecuta `npm test` y **comprueba que falla, y que falla por la razón esperada** (comportamiento ausente, no un error de sintaxis o de importación). Muestra el fallo al usuario.
2. **Verde:** escribe el código mínimo para que el test pase, respetando la arquitectura en capas y las reglas de `CLAUDE.md` (SQL solo en `repositories/` con sentencias preparadas, código y mensajes en español). Ejecuta `npm test` y confirma que pasan **todos** los tests, no solo el nuevo.
3. **Refactor:** limpia el código manteniendo los tests en verde.
4. Prohibido escribir código de producción sin un test rojo previo. Prohibido modificar un test para que pase si el fallo revela un error real del código.
5. **Tareas sin comportamiento testeable** (verificaciones manuales, documentación, configuración): no se inventan tests. Indícalo explícitamente, salta el paso 2 y ve a la prueba real o al commit según corresponda.

### 3. Prueba real con el proyecto levantado

Con los tests en verde, comprueba que la tarea funciona de verdad, **si es posible**:

1. Levanta la API en segundo plano con una BBDD temporal: `DB_PATH=<fichero temporal> JWT_SECRET=<secreto de prueba> PORT=<puerto libre> node src/index.js`. No uses `vendehumos.db` ni el `.env` del usuario.
2. Lanza con `curl` las peticiones que demuestren el comportamiento de la tarea (caso correcto y al menos un caso de error) y compara con lo que dice el plan.
3. Detén el servidor al terminar y borra el fichero temporal.
4. Si la tarea no se puede probar de forma aislada (por ejemplo, depende de tareas posteriores del plan, como cambios en el modelo sin ruta expuesta), dilo expresamente y explica por qué en vez de simular la prueba.
5. Si la prueba falla, vuelve al paso 2 (primero un test que reproduzca el fallo). No hagas commit con la prueba real fallando.

### 4. Commit

- Haz commit en la rama de la tarea siguiendo Conventional Commits en español, como en `.claude/commands/commit.md`: `<tipo>(ámbito): <descripción en imperativo y minúsculas>`. Añade `!` o `BREAKING CHANGE:` si el plan lo marca como cambio incompatible.
- Incluye el test y el código en el mismo commit. Añade los archivos por nombre; nunca `git add -A` ni `git add .`, y nunca `.env`, `*.db` ni `node_modules`.
- Añade la línea de atribución `Co-Authored-By` si las instrucciones del sistema la indican. No uses `--no-verify` ni `--amend`.

### 5. Marcar la tarea como hecha

- Tras el commit, cambia en el plan la casilla de la tarea de `- [ ]` a `- [x]` (solo esa línea) y haz un segundo commit en la misma rama: `docs(plan): marca <Tn> como hecha`.
- Si la tarea fue una verificación manual sin cambios de código, este es su único commit.

### 6. Integrar en la rama de integración del worktree

Las tareas del plan dependen unas de otras, y cada rama sale de la rama de integración. Para que la siguiente tarea contenga el trabajo de la anterior, al terminar una tarea intégrala localmente, dentro del worktree:

1. `git switch <rama-de-integración>`
2. `git merge --no-ff <rama-de-la-tarea>`
3. Ejecuta `npm test` sobre la rama de integración. Si falla, detente y avisa al usuario.

`develop` no se toca: la integración de las ramas de integración en `develop` la decide el usuario tras revisarlas.

La rama de la tarea se conserva sin borrar. Después pasa a la siguiente tarea.

## Si algo falla

- Si un test no se puede poner en verde, la prueba real falla de forma persistente, o la tarea resulta imposible tal como está descrita: detente, deja la rama de la tarea sin integrar, explica el bloqueo al usuario y pregunta cómo seguir. No marques la tarea como hecha.
- Si descubres que el plan está equivocado o incompleto, no lo corrijas en silencio: informa al usuario y propón la modificación.

## Al terminar

Resume al usuario: tareas completadas (con su rama y commit), tareas pendientes o bloqueadas, ruta y rama de integración de cada worktree, resultado de `npm test` en cada rama de integración y las pruebas reales realizadas (o por qué no fue posible hacerlas). Recuerda que no se ha hecho `push`, que los worktrees siguen creados y que ni las ramas de integración se han fusionado en `develop` ni `develop` en la rama principal.

### Avisar por Slack

Después del resumen, envía un mensaje al canal `planes-ed8` (id `C0CAKE90QFR`) con `mcp__slack__slack_post_message` (si su esquema no está cargado, cárgalo antes con `ToolSearch`). Lo escribe Jarvis: redáctalo diciendo que Jarvis ha finalizado la implementación, sin mencionar al usuario. Debe indicar el plan, las tareas completadas frente al total, el resultado de `npm test` en la rama de integración y que ya se puede revisar la implementación. Ejemplo:
`✅ Jarvis ha finalizado la implementación del plan *<título>* (`docs/plans/<archivo>.md`): <N>/<total> tareas hechas, `npm test` en verde en la rama `<rama-de-integración>`. Ya podemos revisar la implementación.`

- **Identificación del agente.** Si trabajas como subagente (quien te lanza te indica tu nombre de agente, p. ej. `agente-pedidos`), el mensaje debe decir quién ha hecho el trabajo y qué tareas concretas (`T1`, `T2`...) ha completado ese agente, y mencionar su rama de integración. Ejemplo: `✅ Jarvis (*agente-pedidos*) ha finalizado su parte del plan *<título>*: tareas T1, T2, T3 hechas (3/<total del agente>), rama `<rama-de-integración>`, `npm test` en verde. Ya podemos revisar su trabajo.` Cada subagente envía su propio mensaje, uno por ejecución.
- Si hay tareas bloqueadas o pendientes, o `npm test` falla, no avises de que se puede revisar: indica en el mensaje qué falta o pregunta antes al usuario si quiere enviarlo.
- Si el envío falla, no lo repitas en bucle: informa al usuario del fallo.
- Envía un único mensaje por ejecución, no uno por tarea.

## Reglas

- No implementes nada que no esté en una tarea del plan.
- No hagas cambios fuera del worktree asignado. No toques ramas distintas de `develop` (solo lectura), las ramas de integración y las ramas de tareas. No hagas `push`, `rebase` ni `reset --hard`.
- La documentación y los mensajes de commit se escriben en español.
