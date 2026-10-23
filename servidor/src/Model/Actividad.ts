import { ObjectId } from "mongodb";

/**
 * Documento de la colección "actividad": una acción realizada por un usuario.
 * Responde a: ¿quién (usuarioId) hizo qué (accion) sobre qué recurso
 * (tipoRecurso, recursoId, nombreRecurso) y cuándo (fecha)?
 *
 * Acciones usadas: LOGIN, CREAR_CARPETA, SUBIR_ARCHIVO, DESCARGAR_ARCHIVO,
 * RENOMBRAR, MOVER, ELIMINAR, RESTAURAR, ELIMINAR_DEFINITIVO,
 * COMPARTIR, CAMBIAR_PERMISO, RETIRAR_ACCESO.
 */
export default class Actividad {
  public usuarioId: ObjectId;
  public accion: string;
  public tipoRecurso: string | null;
  public recursoId: ObjectId | null;
  public nombreRecurso: string | null;
  public detalle: string | null;
  public fecha: Date;
  public _id?: ObjectId;

  /**
   * @param nombreRecurso copia del nombre en el momento de la acción (se conserva aunque cambie o se borre)
   * @param detalle información adicional (ej. "Antes: viejo.txt")
   */
  constructor(
    usuarioId: ObjectId,
    accion: string,
    tipoRecurso: string | null,
    recursoId: ObjectId | null,
    nombreRecurso: string | null,
    detalle: string | null
  ) {
    this.usuarioId = usuarioId;
    this.accion = accion;
    this.tipoRecurso = tipoRecurso;
    this.recursoId = recursoId;
    this.nombreRecurso = nombreRecurso;
    this.detalle = detalle;
    this.fecha = new Date();
  }
}