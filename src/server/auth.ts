import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { config } from "../config.js";

const COOKIE_NAME = "paba_panel_session";

/**
 * Token de sesión: un HMAC de una constante fija, firmado con la contraseña
 * del panel como clave. No hay estado de sesión que guardar en el servidor
 * —si el token coincide, es porque quien lo generó conocía la contraseña—,
 * y no expone la contraseña en ningún momento, ni siquiera en la cookie.
 */
function sessionToken(): string {
  return createHmac("sha256", config.panel.password).update("panel-ok").digest("hex");
}

function parseCookies(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  if (!header) return jar;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) jar[key] = decodeURIComponent(value);
  }

  return jar;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(password: string): boolean {
  return safeEqual(password, config.panel.password);
}

export function setSessionCookie(res: Response): void {
  const token = sessionToken();
  const oneMonth = 30 * 24 * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Max-Age=${oneMonth}; Path=/`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`);
}

function hasValidSession(req: Request): boolean {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  return safeEqual(token, sessionToken());
}

/** Protege cualquier ruta de la API: sin sesión válida, 401 y nada más. */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (hasValidSession(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "No autenticado" });
}
