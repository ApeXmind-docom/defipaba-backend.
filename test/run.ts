import { parseDiscoveryPayload } from "../src/lead/parse.js";
import { computeSlots } from "../src/calendar/slots.js";
import { fromZoned, humanize, humanizeTime, zonedParts } from "../src/util/time.js";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n        esperado: ${e}\n        obtenido: ${a}`);
  }
}

const TZ = "America/Bogota";

/* ------------------------------------------------------ parser del landing */

console.log("\nparseDiscoveryPayload");

const realPayload = `Hola PABA 👋

Acabo de completar mi Discovery DEFIPABA.

Perfil: DIGITAL BUILDER
Interés: DeFi + IA
Nivel DeFi: Básico
Nivel IA: Profesional
Objetivo: Negocio
Disposición: Quiere conversar

Ruta: services

Quiero conocer mi siguiente paso.`;

const parsed = parseDiscoveryPayload(realPayload);
check("perfil", parsed?.profile, "DIGITAL BUILDER");
check("ruta", parsed?.track, "services");
check("nivel defi", parsed?.defiLevel, "Básico");
check("nivel ia", parsed?.aiLevel, "Profesional");
check("objetivo", parsed?.goal, "Negocio");
check("disposicion", parsed?.disposition, "Quiere conversar");

check(
  "sin linea Ruta, deduce por interes",
  parseDiscoveryPayload("Perfil: CONECTOR DIGITAL\nInterés: Comunidad")?.track,
  "community",
);

check(
  "deduce oportunidad",
  parseDiscoveryPayload("Perfil: EXPLORADOR DIGITAL\nInterés: Oportunidades")?.track,
  "opportunity",
);

check(
  "mensaje normal no es payload",
  parseDiscoveryPayload("Hola, vi el anuncio en Instagram y quiero info"),
  null,
);

check(
  "perfil sin ruta ni interes reconocible",
  parseDiscoveryPayload("Perfil: ALGO\nInterés: otra cosa"),
  null,
);

check(
  "tolera etiquetas sin tilde",
  parseDiscoveryPayload("Perfil: DIGITAL BUILDER\nInteres: Comunidad\nDisposicion: Quiere conversar")?.disposition,
  "Quiere conversar",
);

/* --------------------------------------------------------- zona horaria */

console.log("\nutil/time");

// 2026-08-03T14:00:00Z = lunes 3 de agosto, 9:00 a. m. en Bogota (UTC-5).
const monday9am = new Date("2026-08-03T14:00:00Z");

check("zonedParts hora local", zonedParts(monday9am, TZ).hour, 9);
check("zonedParts dia de semana (lunes=1)", zonedParts(monday9am, TZ).weekday, 1);
check("humanizeTime", humanizeTime(monday9am, TZ), "9:00 a. m.");
check("humanize", humanize(monday9am, TZ), "lunes 3 de agosto, 9:00 a. m.");

check(
  "humanizeTime pasado meridiano",
  humanizeTime(new Date("2026-08-03T20:30:00Z"), TZ),
  "3:30 p. m.",
);

check(
  "humanizeTime medianoche",
  humanizeTime(new Date("2026-08-03T05:00:00Z"), TZ),
  "12:00 a. m.",
);

check(
  "fromZoned reconstruye el instante",
  fromZoned({ year: 2026, month: 8, day: 3, hour: 9 }, TZ).toISOString(),
  monday9am.toISOString(),
);

/* -------------------------------------------------------------- huecos */

console.log("\ncomputeSlots");

const base = {
  now: monday9am,
  timezone: TZ,
  workDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
  meetingMinutes: 30,
  leadTimeHours: 3,
  horizonDays: 5,
  limit: 3,
};

const free = computeSlots({ ...base, busy: [] });
check(
  "respeta el margen de 3 horas",
  free.map((s) => humanizeTime(s, TZ)),
  ["12:00 p. m.", "12:30 p. m.", "1:00 p. m."],
);

const withBusy = computeSlots({
  ...base,
  busy: [
    {
      start: Date.parse("2026-08-03T17:00:00Z"), // 12:00 Bogota
      end: Date.parse("2026-08-03T18:00:00Z"), // 13:00 Bogota
    },
  ],
});
check(
  "salta los bloques ocupados",
  withBusy.map((s) => humanizeTime(s, TZ)),
  ["1:00 p. m.", "1:30 p. m.", "2:00 p. m."],
);

const noMonday = computeSlots({ ...base, busy: [], workDays: [2, 3, 4, 5] });
check(
  "salta los dias no laborables",
  noMonday.map((s) => humanize(s, TZ)),
  [
    "martes 4 de agosto, 9:00 a. m.",
    "martes 4 de agosto, 9:30 a. m.",
    "martes 4 de agosto, 10:00 a. m.",
  ],
);

check("respeta el limite", computeSlots({ ...base, busy: [], limit: 2 }).length, 2);

const fullDay = computeSlots({
  ...base,
  busy: [
    {
      start: Date.parse("2026-08-03T14:00:00Z"),
      end: Date.parse("2026-08-04T23:00:00Z"), // todo lunes y martes
    },
  ],
  limit: 1,
});
check(
  "con lunes y martes ocupados salta al miercoles",
  fullDay.map((s) => humanize(s, TZ)),
  ["miercoles 5 de agosto, 9:00 a. m."],
);

const weekend = computeSlots({
  ...base,
  now: new Date("2026-08-07T21:00:00Z"), // viernes 4:00 p. m.
  busy: [],
  limit: 2,
});
check(
  "el viernes tarde salta al lunes siguiente",
  weekend.map((s) => humanize(s, TZ)),
  ["lunes 10 de agosto, 9:00 a. m.", "lunes 10 de agosto, 9:30 a. m."],
);

// Un solo dia de horizonte para aislar el borde de cierre.
const oneDay = computeSlots({ ...base, busy: [], horizonDays: 0, limit: 50 });
check(
  "el ultimo hueco del dia termina justo al cierre",
  humanizeTime(oneDay[oneDay.length - 1]!, TZ),
  "5:30 p. m.",
);
check(
  "ninguna reunion se pasa de las 18:00",
  oneDay.every((slot) => zonedParts(new Date(slot.getTime() + 30 * 60000), TZ).hour <= 18),
  true,
);
check("huecos de 12:00 a 17:30 son 12", oneDay.length, 12);

/* ------------------------------------------------------------ resultado */

console.log(`\n${passed} pruebas superadas, ${failed} fallidas\n`);
if (failed > 0) process.exit(1);
