import { ObjectId } from "mongodb";

export type Permiso = "lectura" | "comentar" | "edicion";
export type TipoRecurso = "archivo" | "carpeta";

/**
 * Documento de la colección "comparticiones".
 * Une a un propietario con un destinatario sobre un archivo o una carpeta.
 * Es una colección aparte (no embebida) porque los reportes la agrupan
 * por recurso y por usuario.
 */
export default class Comparticion {
    public tipoRecurso: TipoRecurso;
    public recursoId: ObjectId;
    public ownerId: ObjectId;
    public destinatarioId: ObjectId;
    public permiso: Permiso;
    public fechaCreacion: Date;
    public _id?: ObjectId;

    constructor(
        tipoRecurso: TipoRecurso,
        recursoId: ObjectId,
        ownerId: ObjectId,
        destinatarioId: ObjectId,
        permiso: Permiso
    ) {
        this.tipoRecurso = tipoRecurso;
        this.recursoId = recursoId;
        this.ownerId = ownerId;
        this.destinatarioId = destinatarioId;
        this.permiso = permiso;
        this.fechaCreacion = new Date();
    }
}