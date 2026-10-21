import { ObjectId } from "mongodb";

/**
 * METADATOS DE UN ARCHIVO. EL CONTENDO  VIVE EN GRIDFS 
 */

export default class Archivo {
    /**
   * @param nombre nombre visible, con extensión (ej. "informe.md")
   * @param tipo extensión permitida: "txt" o "md"
   * @param tamano tamaño en bytes
   * @param ownerId usuario propietario (referencia a usuarios)
   * @param carpetaId carpeta que lo contiene; null si está en la raíz
   * @param gridfsId identificador del contenido en GridFS
   * @param eliminado true si está en la papelera
   * @param fechaEliminacion momento en que pasó a la papelera
   */
  constructor(
    public nombre: string,
    public tipo: "txt" | "md",
    public tamano: number,
    public ownerId: ObjectId,
    public carpetaId: ObjectId | null,
    public gridfsId: ObjectId,
    public eliminado: boolean = false,
    public fechaEliminacion: Date | null = null,
    public fechaCreacion: Date = new Date(),
    public fechaModificacion: Date = new Date(),
    public _id?: ObjectId
  ) {}
}