/**
 * Estado de conexión de cada línea, en memoria — lo consulta el panel para
 * mostrar si Mauricio y Daniel están "en línea" ahora mismo, y para mostrar
 * el código QR cuando una línea todavía no se ha vinculado. Nada de esto se
 * guarda en disco: si el proceso se reinicia, arranca en "desconectado"
 * hasta que Baileys confirme la conexión de nuevo, que es lo correcto.
 */
const connected = new Map<string, boolean>();
const qrImages = new Map<string, string>();

export function setLineConnected(number: string, isConnected: boolean): void {
  connected.set(number, isConnected);
  // Ya conectada: el QR anterior quedó obsoleto, no tiene sentido mostrarlo.
  if (isConnected) qrImages.delete(number);
}

export function isLineConnected(number: string): boolean {
  return connected.get(number) ?? false;
}

export function allLineStatuses(): Record<string, boolean> {
  return Object.fromEntries(connected);
}

/** `dataUrl` es una imagen PNG codificada en base64, lista para un <img src>. */
export function setLineQr(number: string, dataUrl: string): void {
  qrImages.set(number, dataUrl);
}

export function getLineQr(number: string): string | null {
  return qrImages.get(number) ?? null;
}
