import { ObjectId } from "mongodb";

/**
 * Documento de la colección "carpetas".
 * Cada carpeta guarda a su padre (parentId) y la ruta completa desde la raíz
 * (ancestros). Con "ancestros" se detectan ciclos y se encuentran todas las
 * subcarpetas con una sola consulta.
*/
export default class Carpeta {
    public nombre: string;
    public ownerId: ObjectId;
    public parentId: ObjectId | null;
    public ancestros: ObjectId[];
    public eliminada: boolean;
    public eliminadaDirecta: boolean;
    public fechaEliminacion: Date | null;
    public fechaCreacion: Date;
    public _id?: ObjectId;

    /**
     * @param nombre nombre de la carpeta
     * @param ownerId usuario propietario
     * @param parentId carpeta padre (null si está en la raíz)
     * @param ancestros ids de las carpetas por las que se llega a esta, de la raíz hacia abajo
    */
    constructor(nombre: string, ownerId: ObjectId, parentId: ObjectId | null, ancestros: ObjectId[]) {
        this.nombre = nombre;
        this.ownerId = ownerId;
        this.parentId = parentId;
        this.ancestros = ancestros;
        this.eliminada = false;
        this.eliminadaDirecta = false;
        this.fechaEliminacion = null;
        this.fechaCreacion = new Date();
    }
}