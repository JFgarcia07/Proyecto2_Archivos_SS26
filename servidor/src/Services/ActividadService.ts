import { ObjectId } from "mongodb";
import ActividadDB from "../DB/ActividadDB.js";
import CarpetaDB from "../DB/CarpetaDB.js";
import ArchivoDB from "../DB/ArchivoDB.js";
import UsuarioDB from "../DB/UsuarioDB.js";
import Actividad from "../Model/Actividad.js";
import ErrorApp from "../Model/ErrorApp.js";
import { Sesion } from "../Middleware/AuthMiddleware.js";

/**
 * Historial de actividad: registra las acciones de los usuarios y las consulta.
 * Los demás Services llaman a registrar() después de cada operación.
 */
export default class ActividadService {
  private actividadDB: ActividadDB = new ActividadDB();
  private carpetaDB: CarpetaDB = new CarpetaDB();
  private archivoDB: ArchivoDB = new ArchivoDB();
  private usuarioDB: UsuarioDB = new UsuarioDB();

  /**
   * Guarda una acción en el historial.
   * Si falla, solo se muestra en consola: la operación principal no debe cancelarse.
   */
  async registrar(
    usuarioId: string,
    accion: string,
    tipoRecurso: string | null,
    recursoId: ObjectId | null,
    nombreRecurso: string | null,
    detalle: string | null
  ): Promise<void> {
    try {
      const actividad = new Actividad(new ObjectId(usuarioId), accion, tipoRecurso, recursoId, nombreRecurso, detalle);
      await this.actividadDB.registrar(actividad);
    } catch (error) {
      console.error("No se pudo registrar la actividad:", error);
    }
  }

  /** Convierte "AAAA-MM-DD" en Date (inicio o fin del día). @throws ErrorApp 400 si es inválida. */
  private parsearFecha(texto: string | null, finDelDia: boolean): Date | null {
    if (texto === null) return null;
    const fecha = new Date(texto + (finDelDia ? "T23:59:59.999" : "T00:00:00"));
    if (isNaN(fecha.getTime())) {
      throw new ErrorApp("Fecha inválida (use AAAA-MM-DD)", 400);
    }
    return fecha;
  }

  /** Agrega el nombre y correo del usuario a cada registro para mostrarlo en pantalla. */
  private async agregarUsuarios(lista: Actividad[]) {
    const nombres = new Map<string, string>();
    const resultado: any[] = [];

    for (let i = 0; i < lista.length; i++) {
      const clave = lista[i].usuarioId.toString();
      if (!nombres.has(clave)) {
        const usuario = await this.usuarioDB.buscarPorId(lista[i].usuarioId);
        nombres.set(clave, usuario !== null ? usuario.email : "(usuario eliminado)");
      }
      resultado.push({
        _id: lista[i]._id,
        usuario: nombres.get(clave),
        accion: lista[i].accion,
        tipoRecurso: lista[i].tipoRecurso,
        nombreRecurso: lista[i].nombreRecurso,
        detalle: lista[i].detalle,
        fecha: lista[i].fecha,
      });
    }
    return resultado;
  }

  /**
   * Consulta el historial con filtros opcionales (máximo 200 registros).
   * Un usuario normal solo ve su propia actividad; el ADMIN ve la de todos
   * o la de un usuario en particular.
   * @param usuarioId filtro por usuario (solo lo respeta el ADMIN)
   * @param desde fecha inicial AAAA-MM-DD
   * @param hasta fecha final AAAA-MM-DD (inclusive)
   * @param accion filtro por tipo de acción
   */
  async listar(sesion: Sesion, usuarioId: string | null, desde: string | null, hasta: string | null, accion: string | null) {
    let filtroUsuario: ObjectId | null = null;

    if (sesion.rol === "ADMIN") {
      if (usuarioId !== null) {
        if (!ObjectId.isValid(usuarioId)) {
          throw new ErrorApp("Identificador de usuario inválido", 400);
        }
        filtroUsuario = new ObjectId(usuarioId);
      }
    } else {
      filtroUsuario = new ObjectId(sesion.id);
    }

    const lista = await this.actividadDB.buscar(
      {
        usuarioId: filtroUsuario,
        recursoId: null,
        accion: accion,
        desde: this.parsearFecha(desde, false),
        hasta: this.parsearFecha(hasta, true),
      },
      200
    );
    return await this.agregarUsuarios(lista);
  }

  /**
   * Historial de un archivo o carpeta específico. Solo su propietario (o el ADMIN).
   * @throws ErrorApp 404 si el recurso no existe o no es suyo
   */
  async listarDeRecurso(sesion: Sesion, idRecurso: string) {
    if (!ObjectId.isValid(idRecurso)) {
      throw new ErrorApp("Identificador inválido", 400);
    }
    const recursoId = new ObjectId(idRecurso);

    const carpeta = await this.carpetaDB.buscarPorId(recursoId);
    const archivo = await this.archivoDB.buscarPorId(recursoId);

    let ownerId: ObjectId | null = null;
    if (carpeta !== null) ownerId = carpeta.ownerId;
    else if (archivo !== null) ownerId = archivo.ownerId;

    if (ownerId === null || (ownerId.toString() !== sesion.id && sesion.rol !== "ADMIN")) {
      throw new ErrorApp("Recurso no encontrado", 404);
    }

    const lista = await this.actividadDB.buscar(
      { usuarioId: null, recursoId: recursoId, accion: null, desde: null, hasta: null },
      200
    );
    return await this.agregarUsuarios(lista);
  }
}