import { Collection, ObjectId } from "mongodb";
import Conexion from "./Conexion.js";
import Carpeta from "../Model/Carpeta.js";

/**
 * Acceso a datos de la colección "carpetas".
 * Solo consultas a MongoDB, sin reglas de negocio.
*/
export default class CarpetaDB {
    /** Colección "carpetas" (equivale a una tabla). */
    private coleccion(): Collection<Carpeta> {
        return Conexion.obtener().db.collection<Carpeta>("carpetas");
    }

    /** Inserta una carpeta. @return el id generado por MongoDB. */
    async crear(carpeta: Carpeta): Promise<ObjectId> {
        delete carpeta._id; // MongoDB genera el id
        const resultado = await this.coleccion().insertOne(carpeta);
        return resultado.insertedId;
    }

    /** Busca una carpeta por id. @return la carpeta, o null si no existe. */
    async buscarPorId(id: ObjectId): Promise<Carpeta | null> {
        return await this.coleccion().findOne({ _id: id });
    }

    /**
     * Lista las carpetas hijas de una carpeta (o de la raíz) que no están en la papelera.
     * @param parentId carpeta padre (null = raíz)
     */
    async listarHijos(ownerId: ObjectId, parentId: ObjectId | null): Promise<Carpeta[]> {
        return await this.coleccion()
            .find({ ownerId: ownerId, parentId: parentId, eliminada: false })
            .sort({ nombre: 1 })
            .toArray();
    }

    /** Indica si ya existe una carpeta activa con ese nombre dentro del mismo padre. */
    async existeNombre(ownerId: ObjectId, parentId: ObjectId | null, nombre: string): Promise<boolean> {
        const encontrada = await this.coleccion().findOne({
            ownerId: ownerId,
            parentId: parentId,
            nombre: nombre,
            eliminada: false,
        });
        return encontrada !== null;
    }

    /** Cambia el nombre de una carpeta. */
    async renombrar(id: ObjectId, nombre: string): Promise<void> {
        await this.coleccion().updateOne({ _id: id }, { $set: { nombre: nombre } });
    }

    /** Cambia el padre y los ancestros de una carpeta. */
    async mover(id: ObjectId, parentId: ObjectId | null, ancestros: ObjectId[]): Promise<void> {
        await this.coleccion().updateOne(
            { _id: id },
            { $set: { parentId: parentId, ancestros: ancestros } }
        );
    }

    /** Devuelve todas las subcarpetas (a cualquier nivel) de una carpeta. */
    async buscarDescendientes(id: ObjectId): Promise<Carpeta[]> {
        return await this.coleccion().find({ ancestros: id }).toArray();
    }

    /** Reemplaza solo los ancestros de una carpeta. */
    async actualizarAncestros(id: ObjectId, ancestros: ObjectId[]): Promise<void> {
        await this.coleccion().updateOne({ _id: id }, { $set: { ancestros: ancestros } });
    }

    /** Crea los índices: listado por padre y búsqueda de descendientes. */
    async crearIndices(): Promise<void> {
        await this.coleccion().createIndex({ ownerId: 1, parentId: 1, eliminada: 1 });
        await this.coleccion().createIndex({ ancestros: 1 });
    }

    /**
   * Envía una carpeta y todas sus subcarpetas a la papelera con la misma fecha.
   * Solo la carpeta raíz queda como "eliminadaDirecta": es la que se muestra en la papelera.
   */
    async enviarAPapelera(id: ObjectId, fecha: Date): Promise<void> {
        await this.coleccion().updateOne(
            { _id: id },
            { $set: { eliminada: true, eliminadaDirecta: true, fechaEliminacion: fecha } }
        );
        await this.coleccion().updateMany(
            { ancestros: id, eliminada: false },
            { $set: { eliminada: true, eliminadaDirecta: false, fechaEliminacion: fecha } }
        );
    }

    /**
   * Restaura una carpeta y las subcarpetas que se fueron con ella
   * (las que tienen la misma fecha de eliminación).
   */
    async restaurar(id: ObjectId, fecha: Date): Promise<void> {
        await this.coleccion().updateOne(
            { _id: id },
            { $set: { eliminada: false, eliminadaDirecta: false, fechaEliminacion: null } }
        );
        await this.coleccion().updateMany(
            { ancestros: id, eliminada: true, fechaEliminacion: fecha },
            { $set: { eliminada: false, eliminadaDirecta: false, fechaEliminacion: null } }
        );
    }

    /** Lista las carpetas que el usuario eliminó directamente (las que ve en la papelera). */
    async listarEliminadasDirectas(ownerId: ObjectId): Promise<Carpeta[]> {
        return await this.coleccion()
            .find({ ownerId: ownerId, eliminadaDirecta: true })
            .sort({ fechaEliminacion: -1 })
            .toArray();
    }

    /** Borra definitivamente las carpetas indicadas. */
    async eliminarDefinitivo(ids: ObjectId[]): Promise<void> {
        await this.coleccion().deleteMany({ _id: { $in: ids } });
    }

    /** Subcarpetas activas de una carpeta, sin filtrar por dueño (para contenido compartido). */
    async listarHijosDe(parentId: ObjectId): Promise<Carpeta[]> {
        return await this.coleccion().find({ parentId: parentId, eliminada: false }).sort({ nombre: 1 }).toArray();
    }
}