import { Router } from "express";

import { config } from "../config.js";
import {
  allBookings,
  allLeads,
  dashboardStats,
  fullConversation,
  recentActivity,
} from "../db/store.js";
import { allLineStatuses } from "../whatsapp/status.js";
import { checkPassword, clearSessionCookie, requireSession, setSessionCookie } from "./auth.js";

export const api = Router();

/* --------------------------------------------------------------- sesión */

api.post("/login", (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!checkPassword(password)) {
    res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
    return;
  }

  setSessionCookie(res);
  res.json({ ok: true });
});

api.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/* A partir de aquí, todo exige sesión. */
api.use(requireSession);

/* -------------------------------------------------------------- líneas */

api.get("/lines", (_req, res) => {
  const statuses = allLineStatuses();
  res.json(
    config.whatsapp.lines.map((line) => ({
      name: line.name,
      number: line.number,
      connected: statuses[line.number] ?? false,
    })),
  );
});

/* ---------------------------------------------------------------- stats */

api.get("/stats", (_req, res) => {
  res.json(dashboardStats());
});

api.get("/activity", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  res.json(recentActivity(limit));
});

/* ---------------------------------------------------------------- leads */

api.get("/leads", (_req, res) => {
  res.json(allLeads());
});

api.get("/leads/:jid/conversation", (req, res) => {
  res.json(fullConversation(req.params.jid));
});

/* -------------------------------------------------------------- agenda */

api.get("/bookings", (_req, res) => {
  res.json(allBookings());
});
