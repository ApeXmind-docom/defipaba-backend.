/**
 * Estado de conexión de cada línea, en memoria — lo consulta el panel para
 * mostrar si Mauricio y Daniel están "en línea" ahora mismo. No se guarda en
 * disco: si el proceso se reinicia, arranca en "desconectado" hasta que
 * Baileys confirme la conexión de nuevo, que es lo correcto.
 */
const connected = new Map<string, boolean>();

export function setLineConnected(number: string, isConnected: boolean): void {
  connected.set(number, isConnected);
}

export function isLineConnected(number: string): boolean {
  return connected.get(number) ?? false;
}

export function allLineStatuses(): Record<string, boolean> {
  return Object.fromEntries(connected);
}
