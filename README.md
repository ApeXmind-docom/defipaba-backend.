# PABA AI — Backend

Agente de WhatsApp para DEFIPABA. Recibe al lead que llega desde el Discovery
del landing con su perfil ya calculado, conversa según su ruta, consulta su
agenda interna, agenda, confirma y recuerda.

```
Landing → WhatsApp → PABA → Claude → Agenda interna (SQLite)
                       ↓
              confirmación + recordatorios
                       ↓
              resumen diario a cada asesor
```

## Qué hace

- **Lee el diagnóstico.** El primer mensaje trae perfil, ruta, niveles y
  objetivo. PABA los guarda como contexto en vez de preguntarlos de nuevo.
- **Conversa por ruta.** `opportunity`, `community` y `services` tienen
  objetivos distintos: presentar, integrar o diagnosticar.
- **Agenda contra su propia base de reservas.** Sin calendario externo: sólo
  ve lo que PABA mismo agendó. Ver "Agenda — sin calendario externo" más
  abajo para el detalle y el trade-off.
- **Confirma y recuerda.** Mensajes de WhatsApp al lead: uno al agendar, otro
  24 h antes y otro 1 h antes. Configurable.
- **Resumen diario.** Cada asesor recibe sus reuniones del día en su propia
  línea a las 7:00. También puede escribir `agenda` en cualquier momento.
- **Varias líneas, un solo cerebro.** Cada asesor tiene su propio número de
  WhatsApp, pero todos comparten la misma IA, la misma base de leads y la
  misma agenda — igual que NOVA para Refriadvanced.
- **Panel de control web.** Dashboard, leads, conversaciones y agenda en una
  página, protegida por contraseña. Ver "Panel de control" más abajo.

## Stack

Node 20+ · TypeScript · Baileys 6.17 · Claude Haiku · SQLite · Express

## Varias líneas de WhatsApp (multi-asesor)

WhatsApp no permite fusionar dos números reales en una sola conexión: cada
número exige su propia sesión (su propio QR, sus propias credenciales). Eso no
cambia aquí ni en ningún sistema de WhatsApp. Lo que sí es compartido —y es lo
que realmente importa— es todo lo demás: la misma IA responde en las dos
líneas, ambas leen y escriben en la misma base de leads, y ambas agendan
contra la misma agenda interna. Para quien escribe, cada línea se siente
como "el mismo asistente"; por dentro, son dos sockets de Baileys alimentando
un solo backend.

Se configuran así, tantas como hagan falta:

```
WHATSAPP_LINE_1_NAME=Mauricio
WHATSAPP_LINE_1_NUMBER=573136439020
WHATSAPP_LINE_2_NAME=Daniel
WHATSAPP_LINE_2_NUMBER=573003615111
```

Al arrancar, salen los QR de todas las líneas configuradas, uno tras otro —hay
que escanear cada uno desde el teléfono correspondiente. Cada línea guarda su
sesión en su propia carpeta (`./auth/line-<numero>`), así que no hay forma de
mezclarlas por accidente.

**Cómo se reparten las tareas:**

- Un lead responde por la línea que sea. PABA recuerda cuál fue la última que
  usó y por ahí le llegan los recordatorios de su reunión —nunca le escribe de
  golpe un número distinto al que ya conoce.
- Cualquiera de los dos números puede escribir `agenda` y le llega la agenda
  del día completa, sin importar por cuál línea llegan las citas.
- El resumen de las 7:00 llega a cada línea por separado, como un mensaje a sí
  misma (el "Mensaje para ti" de WhatsApp) — se siente nativo del número de
  cada quien, no como si llegara desde el número del otro asesor.

**Decisión que tomé sin preguntar:** ambos números reciben el resumen diario
completo (todas las reuniones, sin filtrar por quién las agendó). Si en
cambio cada asesor sólo debería ver las suyas, o si el segundo número es
puramente de atención a clientes y no debería recibir resúmenes, es un cambio
de pocas líneas en `scheduler/index.ts` — dilo y lo ajusto.


```bash
npm install
cp .env.example .env    # rellena los valores
npm run test            # 27 pruebas de lógica pura
npm run typecheck
npm run build
npm start
```

En desarrollo: `npm run dev` (recarga en caliente).

La primera vez imprime un QR en la terminal **por cada línea configurada**.
Escanea cada uno desde el teléfono correspondiente, en
**WhatsApp → Dispositivos vinculados**. Cada sesión queda en su propia carpeta
(`./auth/line-<numero>`) y no hay que repetirlo salvo que cierres sesión desde
el teléfono.

## Agenda — sin calendario externo

PABA no se conecta a Google Calendar ni a ningún servicio externo: lleva su
propia agenda en la misma base de datos donde ya guarda los leads. Es una
decisión deliberada, tomada para evitar el setup de una cuenta de Google
Cloud (service account, permisos, compartir el calendario).

**Lo que esto significa en la práctica:**

- `consultar_disponibilidad` sólo ve las reuniones que **PABA mismo agendó**.
  Si Mauricio o Daniel tienen algo puesto a mano en su calendario personal,
  una invitación de otro sistema, o cualquier compromiso que no haya pasado
  por WhatsApp, PABA no lo sabe y podría ofrecer ese horario como libre.
- El resumen diario (`agenda`) también lee de esta misma base, no de un
  calendario. Por eso ahora incluye directamente el nombre y el perfil del
  lead —"Juan Pérez — DIGITAL BUILDER · DeFi + IA"— en vez de depender del
  título que Google le hubiera puesto al evento.
- Las reuniones **no aparecen** en el Google Calendar ni en el calendario del
  teléfono de nadie. Toda la confirmación y el recordatorio pasan por
  WhatsApp, que es donde ya está la conversación.

**Si más adelante quieres agregar Google Calendar** para que PABA vea la
agenda real completa (y evitar así choques con compromisos que no pasaron por
WhatsApp), es un cambio acotado: sólo hay que tocar `calendar/local.ts`
—reemplazar `getBusyIntervals()` por una consulta a la API de Google— sin
tocar el resto del sistema. Avísame cuando quieras dar ese paso.

## Panel de control

Una sola página, protegida por contraseña (`PANEL_PASSWORD`), con cuatro
vistas:

- **Dashboard** — tarjetas con total de leads, activos hoy, mensajes de hoy y
  de la semana, reservas totales y próximas; debajo, un feed de actividad
  reciente que se refresca solo cada 20 segundos.
- **Leads** — tabla de todos los leads: nombre, teléfono, perfil, ruta, línea
  por la que escribió, último mensaje. Clic en una fila abre su conversación.
- **Conversaciones** — lista de leads a la izquierda, hilo de mensajes a la
  derecha, con burbujas diferenciando lo que escribió la persona de lo que
  respondió PABA.
- **Agenda** — todas las reservas, pasadas y futuras, con nombre, perfil y
  ruta de quien agendó.

En el encabezado, un indicador por línea (punto verde/rojo) muestra si
Mauricio y Daniel están conectados a WhatsApp en ese momento.

### Cómo entra cada quien

Es una sola contraseña compartida —no hay usuarios ni roles separados—,
pensada para dos o tres personas del equipo, no para exponerla públicamente
más allá de eso. Se las compartes a Mauricio y Daniel y ya pueden entrar
ambos. No hay "recuperar contraseña": si se pierde, se cambia la variable
`PANEL_PASSWORD` en Render y se reinicia el servicio.

### Requisito importante: tipo de servicio en Render

El panel necesita que Render le asigne una URL pública, y eso sólo lo hacen
los servicios de tipo **Web Service**, no los **Background Worker**. Si ya
desplegaste el backend como Background Worker (como decía la guía original,
antes de que existiera el panel), Render no permite cambiar el tipo de un
servicio existente — hay que crear uno nuevo:

1. **New → Web Service** (no Background Worker esta vez), conectando el mismo
   repositorio.
2. Mismo Build Command (`npm install && npm run build`) y Start Command
   (`npm start`) que ya tenías.
3. Agrega un disco nuevo iy las mismas variables de entorno que ya
   configuraste, más `PANEL_PASSWORD`. El puerto (`PORT`) lo asigna Render
   solo — no hace falta agregarlo a mano en un Web Service.
4. Vas a tener que **volver a escanear los dos códigos QR**, porque es
   técnicamente un servicio nuevo con un disco nuevo y vacío. Es la única
   parte molesta de este cambio.
5. Cuando confirmes que el nuevo servicio funciona igual que el anterior,
   borra el Background Worker viejo para no pagar dos servicios a la vez.

## Riesgo de Baileys

Baileys es una biblioteca no oficial. WhatsApp puede bloquear el número, y este
es el número comercial del embudo. Lo que hace el código para reducirlo:

- **Envío serializado.** Nunca hay dos mensajes en vuelo a la vez.
- **Ritmo humano.** Indicador de "escribiendo…" y una pausa proporcional a la
  longitud del texto antes de cada mensaje, con variación aleatoria.
- **Respuestas en burbujas.** Máximo tres por turno, partidas por párrafo.
- **Sin difusión.** Grupos, estados y listas quedan fuera; PABA es uno a uno.
- **Reconexión con espera.** Cuatro segundos entre intentos, no un bucle
  cerrado.
- **Sin sincronización de historial** ni marcado de "en línea" permanente.

Aun así el riesgo no es cero. Recomendaciones operativas: no importar listas de
contactos, no escribir primero a números que nunca te han escrito (salvo los
recordatorios de gente que ya agendó), y mantener el volumen inicial bajo
mientras el número gana antigüedad.

Si algún día migras a la Cloud API oficial, lo único que cambia es
`src/whatsapp/`. El agente, el calendario y el planificador no se enteran.

## Estructura

```
src/
  index.ts              arranque y apagado limpio
  config.ts             variables de entorno validadas
  agent/
    prompts.ts          system prompt y guiones por ruta
    tools.ts            consultar_disponibilidad · agendar_reunion
    claude.ts           bucle de conversación con herramientas
  calendar/
    local.ts            disponibilidad basada en las reservas propias (sin Google)
    slots.ts            cálculo de huecos (función pura)
  lead/
    parse.ts            lectura del payload del Discovery
    types.ts
  db/store.ts           SQLite: leads, historial, reservas, recordatorios
  whatsapp/
    client.ts           conexión Baileys por línea + extracción de texto
    send.ts             cola de envío con ritmo humano
    handler.ts          router de mensajes; detecta operador en cualquier línea
  scheduler/
    index.ts            ciclo de un minuto: recordatorios y resumen
    digest.ts           agenda del día
  util/
    time.ts             zona horaria sin dependencias
    log.ts
test/run.ts             pruebas de la lógica pura
```

## Decisiones que conviene conocer

**El modelo no puede inventar horarios.** `agendar_reunion` valida que el
inicio esté entre los que `consultar_disponibilidad` devolvió en esa
conversación. Si no coincide, la herramienta devuelve error y le pide volver a
consultar. Una alucinación de horario se convierte en un reintento, no en una
reunión falsa.

**Reserva y recordatorios se guardan en una transacción.** No puede quedar una
reunión sin avisos ni avisos apuntando a una reunión que no existe.

**El recordatorio se marca como enviado antes de mandarlo.** Si el proceso
muere en medio, se pierde un recordatorio. La alternativa —marcar después—
haría que al reiniciar se reenviara en cada ciclo. Perder uno es mejor que
repetirlo diez veces.

**El resumen diario y la disponibilidad leen de la misma base que los leads,
no de un calendario externo.** Es la decisión que se tomó al quitar Google
Calendar: más simple de desplegar, a cambio de sólo ver lo que PABA mismo
agendó. Ver "Agenda — sin calendario externo" más arriba.

**Los recordatorios van por la línea que el lead usó por última vez**, no por
una línea fija. Se guarda en cada lead (`leads.line_number`) y se actualiza en
cada mensaje entrante, así que si algún día escribe por la otra línea, los
recordatorios lo siguen ahí.

**El historial se corta en 24 mensajes.** Es el control de coste principal.
Súbelo en `MAX_HISTORY_MESSAGES` si las conversaciones se quedan cortas de
contexto.

**Cumplimiento en el prompt.** PABA tiene prohibido prometer rendimientos, dar
asesoría financiera y pedir documento, datos bancarios, claves o seed phrases.
Coincide con el descargo legal del landing.

## Despliegue en Render

Servicio de tipo **Background Worker** (no Web Service: no expone puertos).

- Build: `npm install && npm run build`
- Start: `npm start`
- **Disco persistente obligatorio.** Sin él se pierden la sesión de WhatsApp y
  la base de datos en cada despliegue, y habría que reescanear el QR.

Monta el disco en `/data` y apunta:

```
SESSION_DIR=/data/auth
DB_PATH=/data/paba.db
```

El primer arranque necesita que veas los logs para escanear el QR.

## Pendiente para más adelante

- Transcripción de audios (Whisper), hoy los mensajes de voz se ignoran.
- Reprogramación y cancelación desde la conversación.
- Panel de leads y métricas de conversión por ruta.
- Traspaso a humano cuando la conversación se atasca.
