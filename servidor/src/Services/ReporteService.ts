import { ObjectId } from "mongodb";
import ReporteDB from "../DB/ReporteDB.js";
import UsuarioDB from "../DB/UsuarioDB.js";
import ActividadService from "./ActividadService.js";
import ErrorApp from "../Model/ErrorApp.js";
import { Sesion } from "../Middleware/AuthMiddleware.js";

/**
 * Reportes del sistema. Valida los parámetros (fechas, usuario, período)
 * y delega las consultas en ReporteDB. El reporte 9 reutiliza el historial.
 */
export default class ReporteService {
  private reporteDB: ReporteDB = new ReporteDB();
  private usuarioDB: UsuarioDB = new UsuarioDB();
  private actividadService: ActividadService = new ActividadService();

  /** Convierte "AAAA-MM-DD" en Date (inicio o fin del día). @throws ErrorApp 400 si es inválida. */
  private parsearFecha(texto: string | null, finDelDia: boolean): Date | null {
    if (texto === null) return null;
    const fecha = new Date(texto + (finDelDia ? "T23:59:59.999" : "T00:00:00"));
    if (isNaN(fecha.getTime())) {
      throw new ErrorApp("Fecha inválida (use AAAA-MM-DD)", 400);
    }
    return fecha;
  }

  /** Convierte y valida el rango. @throws ErrorApp 400 si "desde" es posterior a "hasta". */
  private rango(desde: string | null, hasta: string | null): { desde: Date | null; hasta: Date | null } {
    const d = this.parsearFecha(desde, false);
    const h = this.parsearFecha(hasta, true);
    if (d !== null && h !== null && d.getTime() > h.getTime()) {
      throw new ErrorApp("La fecha inicial no puede ser posterior a la final", 400);
    }
    return { desde: d, hasta: h };
  }

  /** Verifica que el usuario exista. @throws ErrorApp 400 si el id es inválido, 404 si no existe. */
  private async verificarUsuario(idUsuario: string): Promise<ObjectId> {
    if (!ObjectId.isValid(idUsuario)) {
      throw new ErrorApp("Identificador de usuario inválido", 400);
    }
    const id = new ObjectId(idUsuario);
    if ((await this.usuarioDB.buscarPorId(id)) === null) {
      throw new ErrorApp("Usuario no encontrado", 404);
    }
    return id;
  }

  /** Lista de usuarios (sin contraseñas) para los selectores de la pantalla. */
  async listarUsuarios() {
    const lista = await this.usuarioDB.listarTodos();
    const resultado: any[] = [];
    for (let i = 0; i < lista.length; i++) {
      resultado.push({ id: lista[i]._id, nombre: lista[i].nombre, email: lista[i].email });
    }
    return resultado;
  }

  async archivosPorTipo() {
    return await this.reporteDB.archivosPorTipo();
  }

  async archivosPorFechas(desde: string | null, hasta: string | null) {
    const r = this.rango(desde, hasta);
    return await this.reporteDB.archivosPorFechas(r.desde, r.hasta);
  }

  async archivosConMasOperaciones() {
    return await this.reporteDB.archivosConMasOperaciones(10);
  }

  async usuariosConMasArchivos() {
    return await this.reporteDB.usuariosConMasArchivos();
  }

  async usuariosConMasCompartidos() {
    return await this.reporteDB.usuariosConMasCompartidos();
  }

  async archivosMasCompartidos() {
    return await this.reporteDB.archivosMasCompartidos();
  }

  /** Recursos que el usuario seleccionado compartió con otros. */
  async compartidosPor(idUsuario: string) {
    const id = await this.verificarUsuario(idUsuario);
    return await this.reporteDB.comparticionesDe("ownerId", id);
  }

  /** Recursos que otros compartieron con el usuario seleccionado. */
  async recibidosPor(idUsuario: string) {
    const id = await this.verificarUsuario(idUsuario);
    return await this.reporteDB.comparticionesDe("destinatarioId", id);
  }

  /** Historial de un usuario dentro de un rango de fechas (reutiliza ActividadService). */
  async actividadDeUsuario(sesion: Sesion, idUsuario: string, desde: string | null, hasta: string | null) {
    await this.verificarUsuario(idUsuario);
    this.rango(desde, hasta);
    return await this.actividadService.listar(sesion, idUsuario, desde, hasta, null);
  }

  async operacionesPorTipo(desde: string | null, hasta: string | null) {
    const r = this.rango(desde, hasta);
    return await this.reporteDB.operacionesPorTipo(r.desde, r.hasta);
  }

  /** @param periodo "dia" o "mes" (si no viene, se usa "dia") */
  async operacionesPorPeriodo(periodo: string | null, desde: string | null, hasta: string | null) {
    const p = periodo === null ? "dia" : periodo;
    if (p !== "dia" && p !== "mes") {
      throw new ErrorApp("Período inválido (dia o mes)", 400);
    }
    const r = this.rango(desde, hasta);
    return await this.reporteDB.operacionesPorPeriodo(p, r.desde, r.hasta);
  }

  async principalesAcciones(desde: string | null, hasta: string | null) {
    const r = this.rango(desde, hasta);
    return await this.reporteDB.principalesAcciones(r.desde, r.hasta);
  }
}