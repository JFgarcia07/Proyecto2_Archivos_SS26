import { Collection, GridFSBucket, ObjectId, Filter } from "mongodb";
import Conexion from "./Conexion.js";
import Archivo from "../Model/Archivo.js";

/**
 * Acceso a datos de archivos. Solo habla con MongoDB, sin reglas de negocio.
 * Usa dos cosas: la colección "archivos" (metadatos) y GridFS (contenido).
 */
export default class ArchivoDB {

    /** Colección "archivos" de MongoDB -- es una tabla */
    private coleccion(): Collection<Archivo> {
        return Conexion.obtener().db.collection<Archivo>("archivos");
    }

    /** Almacén GridFS donde se guarda el contenido de los archivos. */
    private bucket(): GridFSBucket {
        return new GridFSBucket(Conexion.obtener().db, { bucketName: "contenidos" });
    }

    /**
    * Guarda el contenido del archivo en GridFS.
    * @param nombre nombre con el que se registra el contenido
    * @param contenido bytes del archivo
    * @return el id del contenido en GridFS
    */
    async guardarContenido(nombre: string, contenido: Buffer): Promise<ObjectId> {
        const subida = this.bucket().openUploadStream(nombre);
        const idContendio = subida.id as ObjectId;

        await new Promise<void>((resolve, reject) => {
            subida.on("finish", () => resolve());
            subida.on("error", (error) => reject(error));
            subida.end(contenido);
        });
        return idContendio;
    }

    /** Abre un flujo para leer el contenido guardado en GridFS */
    abrirContenido(idContenido: ObjectId) {
        return this.bucket().openDownloadStream(idContenido);
    }

    /**
     * Inserta los metadatos de un archivo
     * @return el id generado por MongoDB
    */
    async crear(archivo: Archivo): Promise<ObjectId> {
        delete archivo._id; // MongoDB genera el id
        const resultado = await this.coleccion().insertOne(archivo);
        return resultado.insertedId;
    }

    /** Busca un archivo por id. @return el archivo, o null si no existe. */
    async buscarPorId(id: ObjectId): Promise<Archivo | null> {
        return await this.coleccion().findOne({ _id: id });
    }

    /**
   * Lista los archivos de una carpeta que no están en la papelera.
   * @param ownerId dueño de los archivos
   * @param carpetaId carpeta a listar (null = raíz)
   * @param texto si no es null, filtra por nombre (sin distinguir mayúsculas)
   * @param tipo si no es null, filtra por extensión ("txt" o "md")
   */
    async listar(
        ownerId: ObjectId,
        carpetaId: ObjectId | null,
        texto: string | null,
        tipo: string | null
    ): Promise<Archivo[]> {
        const filtro: Filter<Archivo> = { ownerId: ownerId, carpetaId: carpetaId, eliminado: false };

        if (texto !== null) {
            // Se escapan los símbolos especiales para que se busque como texto normal.
            const textoSeguro = texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filtro.nombre = { $regex: textoSeguro, $options: "i" };
        }
        if (tipo === "txt" || tipo === "md") {
            filtro.tipo = tipo;
        }

        return await this.coleccion().find(filtro).sort({ nombre: 1 }).toArray();
    }

    /** Indica si ya existe un archivo activo con ese nombre en la carpeta. */
    async existeNombre(ownerId: ObjectId, carpetaId: ObjectId | null, nombre: string): Promise<boolean> {
        const encontrado = await this.coleccion().findOne({
            ownerId: ownerId,
            carpetaId: carpetaId,
            nombre: nombre,
            eliminado: false,
        });
        return encontrado !== null;
    }

    /** Cambia el nombre y el tipo de un archivo. */
    async renombrar(id: ObjectId, nombre: string, tipo: "txt" | "md"): Promise<void> {
        await this.coleccion().updateOne(
            { _id: id },
            { $set: { nombre: nombre, tipo: tipo, fechaModificacion: new Date() } }
        );
    }

    /** Cambia la carpeta de un archivo (null = raíz). */
    async mover(id: ObjectId, carpetaId: ObjectId | null): Promise<void> {
        await this.coleccion().updateOne(
            { _id: id },
            { $set: { carpetaId: carpetaId, fechaModificacion: new Date() } }
        );
    }

    /** Crea los índices que aceleran las consultas más comunes. */
    async crearIndices(): Promise<void> {
        await this.coleccion().createIndex({ ownerId: 1, carpetaId: 1, eliminado: 1 });
        await this.coleccion().createIndex({ tipo: 1 });
        await this.coleccion().createIndex({ fechaCreacion: 1 });
    }

    /** Envía un archivo a la papelera (eliminado directamente por el usuario). */
    async enviarAPapelera(id: ObjectId, fecha: Date): Promise<void> {
        await this.coleccion().updateOne(
            { _id: id },
            { $set: { eliminado: true, eliminadoDirecto: true, fechaEliminacion: fecha } }
        );
    }

    /** Envía a la papelera los archivos contenidos en las carpetas indicadas. */
    async enviarPorCarpetas(carpetaIds: ObjectId[], fecha: Date): Promise<void> {
        await this.coleccion().updateMany(
            { carpetaId: { $in: carpetaIds }, eliminado: false },
            { $set: { eliminado: true, eliminadoDirecto: false, fechaEliminacion: fecha } }
        );
    }

    /** Saca un archivo de la papelera. */
    async restaurar(id: ObjectId): Promise<void> {
        await this.coleccion().updateOne(
            { _id: id },
            { $set: { eliminado: false, eliminadoDirecto: false, fechaEliminacion: null } }
        );
    }

    /** Restaura los archivos que se fueron con una carpeta (misma fecha de eliminación). */
    async restaurarPorCarpetas(carpetaIds: ObjectId[], fecha: Date): Promise<void> {
        await this.coleccion().updateMany(
            { carpetaId: { $in: carpetaIds }, eliminado: true, eliminadoDirecto: false, fechaEliminacion: fecha },
            { $set: { eliminado: false, eliminadoDirecto: false, fechaEliminacion: null } }
        );
    }

    /** Lista los archivos que el usuario eliminó directamente. */
    async listarEliminadosDirectos(ownerId: ObjectId): Promise<Archivo[]> {
        return await this.coleccion()
            .find({ ownerId: ownerId, eliminadoDirecto: true })
            .sort({ fechaEliminacion: -1 })
            .toArray();
    }

    /** Devuelve todos los archivos (activos o no) de las carpetas indicadas. */
    async listarPorCarpetas(carpetaIds: ObjectId[]): Promise<Archivo[]> {
        return await this.coleccion().find({ carpetaId: { $in: carpetaIds } }).toArray();
    }

    /** Borra definitivamente los archivos: su contenido en GridFS y sus metadatos. */
    async eliminarDefinitivo(archivos: Archivo[]): Promise<void> {
        for (let i = 0; i < archivos.length; i++) {
            try {
                await this.bucket().delete(archivos[i].gridfsId);
            } catch (error) {
                // El contenido ya no existía; se continúa con los metadatos.
            }
            await this.coleccion().deleteOne({ _id: archivos[i]._id });
        }
    }

    /** Archivos activos de una carpeta, sin filtrar por dueño (para contenido compartido). */
    async listarDeCarpeta(carpetaId: ObjectId): Promise<Archivo[]> {
        return await this.coleccion().find({ carpetaId: carpetaId, eliminado: false }).sort({ nombre: 1 }).toArray();
    }
}