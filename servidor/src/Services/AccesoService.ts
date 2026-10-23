import { ObjectId } from "mongodb";
import ComparticionDB from "../DB/ComparticionDB.js";
import CarpetaDB from "../DB/CarpetaDB.js";
import Carpeta from "../Model/Carpeta.js";
import Archivo from "../Model/Archivo.js";
import { Sesion } from "../Middleware/AuthMiddleware.js";

/** Niveles de acceso, de menor a mayor. */
export const Nivel = { NINGUNO: 0, LECTURA: 1, COMENTAR: 2, EDICION: 3, DUENO: 4 };

/**
 * Calcula el nivel de acceso de un usuario sobre una carpeta o un archivo.
 * Una compartición sobre una carpeta se hereda a todo lo que contiene.
 */
export default class AccesoService {
    private comparticionDB: ComparticionDB = new ComparticionDB();
    private carpetaDB: CarpetaDB = new CarpetaDB();

    private nivelDePermiso(permiso: string): number {
        if (permiso === "edicion") return Nivel.EDICION;
        if (permiso === "comentar") return Nivel.COMENTAR;
        if (permiso === "lectura") return Nivel.LECTURA;
        return Nivel.NINGUNO;
    }

    /** Devuelve el mayor nivel que el usuario tenga sobre cualquiera de esos recursos. */
    private async mayorNivel(recursoIds: ObjectId[], usuarioId: ObjectId): Promise<number> {
        const lista = await this.comparticionDB.buscarPorRecursos(recursoIds, usuarioId);
        let mayor = Nivel.NINGUNO;
        for (let i = 0; i < lista.length; i++) {
            const nivel = this.nivelDePermiso(lista[i].permiso);
            if (nivel > mayor) {
                mayor = nivel;
            }
        }
        return mayor;
    }

    /** Nivel del usuario sobre una carpeta: dueño, compartida (directa o por un ancestro) o ninguno. */
    async nivelSobreCarpeta(sesion: Sesion, carpeta: Carpeta): Promise<number> {
        if (carpeta.ownerId.toString() === sesion.id) return Nivel.DUENO;
        if (carpeta.eliminada) return Nivel.NINGUNO;

        const ids: ObjectId[] = [...carpeta.ancestros, carpeta._id!];
        return await this.mayorNivel(ids, new ObjectId(sesion.id));
    }

    /** Nivel del usuario sobre un archivo: dueño, compartido (directo o por su carpeta) o ninguno. */
    async nivelSobreArchivo(sesion: Sesion, archivo: Archivo): Promise<number> {
        if (archivo.ownerId.toString() === sesion.id) return Nivel.DUENO;
        if (archivo.eliminado) return Nivel.NINGUNO;

        const ids: ObjectId[] = [archivo._id!];
        if (archivo.carpetaId !== null) {
            const carpeta = await this.carpetaDB.buscarPorId(archivo.carpetaId);
            if (carpeta === null || carpeta.eliminada) return Nivel.NINGUNO;
            ids.push(carpeta._id!);
            for (let i = 0; i < carpeta.ancestros.length; i++) {
                ids.push(carpeta.ancestros[i]);
            }
        }
        return await this.mayorNivel(ids, new ObjectId(sesion.id));
    }
}