import { bookingsBetween } from "../db/store.js";
import type { Interval } from "./slots.js";

/**
 * Disponibilidad basada únicamente en lo que PABA mismo ha agendado.
 *
 * Sin conexión a un calendario externo, esto es lo que PABA puede ver: sus
 * propias reservas, nada más. Cualquier compromiso que Mauricio o Daniel
 * tengan por fuera de WhatsApp —una cita personal, una reunión agendada a
 * mano, una invitación de otro sistema— es invisible aquí, y PABA podría
 * ofrecer ese horario como libre sin saber que ya está ocupado.
 *
 * Es la decisión que se tomó a cambio de no requerir una cuenta de Google
 * Cloud: más simple de desplegar, pero sin la protección contra choques que
 * daría ver la agenda real completa.
 */
export function getBusyIntervals(from: Date, to: Date): Interval[] {
  return bookingsBetween(from.getTime(), to.getTime()).map((booking) => ({
    start: booking.startsAt,
    end: booking.endsAt,
  }));
}
