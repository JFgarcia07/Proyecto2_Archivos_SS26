import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/** Datos del usuario que vienen dentro del token JWT. */
export interface Sesion {
  id: string;
  rol: "ADMIN" | "USUARIO";
}

/** Request de Express al que se le agrega la sesión del usuario autenticado. */
export interface RequestAuth extends Request {
  sesion?: Sesion;
}

/**
 * Filtro de autenticación (como un filtro de Spring Security).
 * Lee el header "Authorization: Bearer <token>", valida el token y deja
 * la sesión en req.sesion. Si el token falta o es inválido, responde 401.
 */
export function autenticar(req: RequestAuth, res: Response, next: NextFunction): void {
  const cabecera = req.headers.authorization;

  if (cabecera === undefined || !cabecera.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }

  const token = cabecera.substring(7);

  try {
    const datos = jwt.verify(token, process.env.JWT_SECRET as string) as Sesion;
    req.sesion = { id: datos.id, rol: datos.rol };
    next(); // el token es válido: continúa hacia el Controller
  } catch (error) {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

/**
 * Permite el paso solo a administradores. Se usa después de autenticar().
 * Responde 403 si el usuario no es ADMIN.
 */
export function soloAdmin(req: RequestAuth, res: Response, next: NextFunction): void {
  if (req.sesion === undefined || req.sesion.rol !== "ADMIN") {
    res.status(403).json({ error: "Acceso restringido a administradores" });
    return;
  }
  next();
}