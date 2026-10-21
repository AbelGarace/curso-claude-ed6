---
name: plan-feature
description: Planifica cómo implementar una nueva funcionalidad o corregir un bug y genera un plan detallado en docs/plans con una lista de tareas de 5-10 minutos. Úsala cuando el usuario pida planificar, diseñar o preparar el trabajo antes de programar.
argument-hint: <descripción de la funcionalidad o del bug>
---

# plan-feature

Genera un plan de implementación en `docs/plans/` para una funcionalidad nueva o la corrección de un bug. **No implementes nada**: esta skill solo produce el plan.

Petición del usuario: $ARGUMENTS

## Pasos

1. **Entiende la petición.** Si `$ARGUMENTS` está vacío o es ambiguo (falta el comportamiento esperado, el alcance o los pasos para reproducir un bug), pregunta con `AskUserQuestion`. No preguntes lo que puedas deducir del código.
2. **Explora el código.** Lee `CLAUDE.md` y los archivos relevantes de cada capa (`routes`, `controllers`, `services`, `repositories`, `models`, `helpers`). Si afecta a un GET con listados, lee `docs/api/api-pagination.md`. Para un bug, localiza la causa raíz antes de planificar la corrección.
3. **Diseña la solución** respetando las reglas del proyecto: arquitectura en capas, SQL solo en repositories con sentencias preparadas, sin ORM ni dependencias de BBDD, código y mensajes en español.
4. **Lee la plantilla** [assets/plantilla-plan.md](assets/plantilla-plan.md) y rellénala respetando sus secciones y su orden. No elimines secciones; si una no aplica, indícalo brevemente.
5. **Divide el trabajo en tareas** (sección 5) siguiendo estas reglas:
   - Cada tarea debe poder hacerse en **5-10 minutos**. Si es mayor, divídela.
   - Una tarea = un cambio concreto y verificable, normalmente en un solo archivo o capa.
   - Indica la estimación (`~5 min`, `~10 min`) y el archivo afectado.
   - Ordénalas según dependencias, de la capa más baja a la más alta (modelo/repository → service → controller → route), y deja al final la verificación y la documentación.
   - Usa casillas `- [ ]` numeradas `T1`, `T2`...
6. **Guarda el plan** en `docs/plans/<AAAA-MM-DD>-<slug>.md`, donde el slug es kebab-case en español, sin tildes, y empieza por `feat-` o `fix-` según el tipo (por ejemplo `2026-10-15-feat-favoritos.md`). Crea la carpeta si no existe. No sobrescribas un plan existente: si el nombre ya existe, pregunta al usuario.
7. **Resume al usuario** el plan: ruta del archivo, número de tareas, tiempo total estimado y las dudas abiertas. Pregunta si quiere ajustar algo antes de empezar a implementarlo.
8. **Avisa por Slack.** Cuando el plan esté guardado, envía un mensaje al canal `planes-ed8` (id `C0CAKE90QFR`) con `mcp__slack__slack_post_message` (si su esquema no está cargado, cárgalo antes con `ToolSearch`). El mensaje lo escribe Jarvis: redáctalo diciendo que Jarvis ha finalizado la planificación, sin mencionar al usuario. Debe incluir la ruta del plan, el número de tareas y el tiempo total estimado, y avisar de que ya se puede revisar. Ejemplo:
   `📝 Jarvis ha finalizado la planificación *<título>* (`docs/plans/<archivo>.md`): <N> tareas, ~<X> min en total. Ya podemos revisar el plan.`
   Si el envío falla (herramienta no disponible, error de Slack), no repitas en bucle: informa al usuario del fallo y termina igualmente.

## Reglas

- La documentación del plan se escribe en español.
- El aviso por Slack solo va al canal `planes-ed8`, una vez y al terminar el plan; nunca antes de que el archivo esté guardado.
- No modifiques código fuente ni `CLAUDE.md` al planificar.
- Si el plan introduce un cambio incompatible (breaking change), indícalo en "Riesgos y dudas abiertas".
