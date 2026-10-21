---
description: Crea un commit siguiendo la especificación Conventional Commits
argument-hint: [contexto opcional sobre el cambio]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*)
---

Crea un commit de los cambios actuales siguiendo la especificación [Conventional Commits 1.0.0](https://www.conventionalcommits.org/es/v1.0.0/).

Contexto adicional del usuario (puede estar vacío): $ARGUMENTS

## Contexto del repositorio

- Estado: !`git status --short`
- Cambios preparados: !`git diff --cached --stat`
- Cambios sin preparar: !`git diff --stat`
- Últimos commits: !`git log --oneline -5`

## Pasos

1. Si el directorio no es un repositorio git, avísalo y detente.
2. Revisa los cambios con `git diff --cached` (y `git diff` si no hay nada preparado) para entender qué se ha modificado realmente.
3. Si no hay nada preparado, añade al área de preparación los archivos relevantes por nombre. Nunca uses `git add -A` ni `git add .`, y no incluyas secretos (`.env`, claves, credenciales) ni archivos generados (`node_modules`, `*.db`).
4. Si los cambios mezclan propósitos distintos (por ejemplo una funcionalidad y una corrección no relacionadas), propón dividirlos en varios commits y haz un commit por cada uno.
5. Redacta el mensaje cumpliendo las reglas anteriores y muestraselo al usuario utilizando la tool `AskUserQuestion` para preguntarle si le parece bien el mensaje. Si no le parece bien, genera otro mensaje y le vuelves a preguntar. Cuando lo de por válido sigue con el paso 6.
6. Redacta el mensaje y crea el commit con `git commit`. No uses `--no-verify` ni `--amend`, salvo que el usuario lo pida.
7. Muestra el resultado con `git log -1 --stat`.

## Formato del mensaje

```
<tipo>[ámbito opcional][!]: <descripción>

[cuerpo opcional]

[pie(s) opcional(es)]
```

### Tipos permitidos

- `feat`: nueva funcionalidad (SemVer MINOR).
- `fix`: corrección de un error (SemVer PATCH).
- `docs`: solo documentación.
- `style`: formato que no afecta al significado del código (espacios, comas, etc.).
- `refactor`: cambio de código que no corrige un error ni añade funcionalidad.
- `perf`: mejora de rendimiento.
- `test`: añadir o corregir tests.
- `build`: sistema de build o dependencias (npm, etc.).
- `ci`: configuración de integración continua.
- `chore`: tareas de mantenimiento que no tocan `src` ni tests.
- `revert`: revierte un commit anterior.

### Reglas

- Tipo en minúsculas, seguido de `:` y un espacio.
- Ámbito opcional entre paréntesis, con un sustantivo que indique la zona afectada: `feat(auth): ...`. En este proyecto sirven `auth`, `vendehumos`, `db`, `routes`, etc.
- Descripción en español, en imperativo y minúsculas, sin punto final y de 72 caracteres como máximo en la primera línea (por ejemplo: `añade login con JWT`).
- Cuerpo opcional, separado por una línea en blanco: explica el *qué* y el *porqué*, no el *cómo*.
- Cambios incompatibles (breaking changes): añade `!` tras el tipo/ámbito (`feat(api)!: ...`) y/o un pie `BREAKING CHANGE: <descripción>`.
- Pies opcionales con formato `Token: valor` (por ejemplo `Refs: #12`).
- Si las instrucciones del sistema o del proyecto indican una línea de atribución (`Co-Authored-By`), añádela al final como pie.

## Ejemplos

```
feat(auth): añade registro y login con JWT
fix(vendehumos): devuelve 404 si el id no existe
docs: documenta el flujo de autenticación en CLAUDE.md
refactor(vendehumos)!: migra el almacenamiento a SQLite

BREAKING CHANGE: los datos en memoria anteriores no se conservan.
```

Pasa el mensaje a `git commit` con un heredoc para respetar los saltos de línea.
