import { ObjectId } from "mongodb";
import ArchivoDB from "../DB/ArchivoDB.js";
import CarpetaDB from "../DB/CarpetaDB.js";
import Archivo from "../Model/Archivo.js";
import ErrorApp from "../Model/ErrorApp.js";
import { Sesion } from "../Middleware/AuthMiddleware.js";
import ActividadService from "./ActividadService.js";

/**
 * Reglas de negocio de los archivos:
 * solo .txt y .md, nombre único por carpeta, y acceso solo del propietario.
*/
export default class ArchivoService {
    private archivoDB: ArchivoDB = new ArchivoDB();
    private carpetaDB: CarpetaDB = new CarpetaDB();
    private actividad: ActividadService = new ActividadService();

    /** Convierte un texto en ObjectId. @throws ErrorApp 400 si no es válido. */
    private convertirId(id: string): ObjectId {
        if (!ObjectId.isValid(id)) {
            throw new ErrorApp("Identificador inválido", 400);
        }
        return new ObjectId(id);
    }

    /** Valida que el nombre no esté vacío. @return el nombre sin espacios sobrantes. */
    private validarNombre(nombre: unknown): string {
        if (typeof nombre !== "string" || nombre.trim() === "") {
            throw new ErrorApp("El nombre es requerido", 400);
        }
        return nombre.trim();
    }

    /**
     * Obtiene el tipo según la extensión del nombre.
     * @throws ErrorApp 400 si no es .txt ni .md
     */
    private obtenerTipo(nombre: string): "txt" | "md" {
        const punto = nombre.lastIndexOf(".");
        const extension = punto >= 0 ? nombre.substring(punto + 1).toLowerCase() : "";

        if (extension === "txt") return "txt";
        if (extension === "md") return "md";
        throw new ErrorApp("Solo se permiten archivos .txt y .md", 400);
    }


    /**
     * Verifica que la carpeta exista, sea del usuario y no esté en la papelera.
     * @return el id de la carpeta
     * @throws ErrorApp 404 si no cumple
     */
    private async verificarCarpeta(sesion: Sesion, idCarpeta: string): Promise<ObjectId> {
        const carpeta = await this.carpetaDB.buscarPorId(this.convertirId(idCarpeta));
        if (carpeta === null || carpeta.eliminada || carpeta.ownerId.toString() !== sesion.id) {
            throw new ErrorApp("Carpeta no encontrada", 404);
        }
        return carpeta._id!;
    }

    /**
    * Busca el archivo y verifica que sea del usuario y no esté en la papelera.
    * @throws ErrorApp 404 si no cumple
    */
    private async buscarArchivoPropio(sesion: Sesion, idArchivo: string): Promise<Archivo> {
        const archivo = await this.archivoDB.buscarPorId(this.convertirId(idArchivo));
        if (archivo === null || archivo.eliminado || archivo.ownerId.toString() !== sesion.id) {
            throw new ErrorApp("Archivo no encontrado", 404);
        }
        return archivo;
    }

    /**
     * Sube un archivo: guarda el contenido en GridFS y los metadatos en "archivos".
     * @param nombreOriginal nombre enviado por el cliente
     * @param contenido bytes del archivo
     * @param idCarpeta carpeta destino (null = raíz)
     * @throws ErrorApp 400 si la extensión no es válida, 409 si el nombre ya existe
     */
    async subir(sesion: Sesion, nombreOriginal: string, contenido: Buffer, idCarpeta: string | null) {
        const nombre = this.validarNombre(nombreOriginal);
        const tipo = this.obtenerTipo(nombre);
        const ownerId = new ObjectId(sesion.id);

        let carpetaId: ObjectId | null = null;
        if (idCarpeta !== null) {
            carpetaId = await this.verificarCarpeta(sesion, idCarpeta);
        }

        if (await this.archivoDB.existeNombre(ownerId, carpetaId, nombre)) {
            throw new ErrorApp("Ya existe un archivo con ese nombre en la carpeta", 409);
        }

        const gridfsId = await this.archivoDB.guardarContenido(nombre, contenido);
        const archivo = new Archivo(nombre, tipo, contenido.length, ownerId, carpetaId, gridfsId);
        const id = await this.archivoDB.crear(archivo);
        await this.actividad.registrar(sesion.id, "SUBIR_ARCHIVO", "archivo", id, nombre, null);

        return { id: id, nombre: nombre, tipo: tipo, tamano: contenido.length, carpetaId: carpetaId };
    }

    /** Lista los archivos de una carpeta, con búsqueda por nombre y filtro por tipo. */
    async listar(sesion: Sesion, idCarpeta: string | null, texto: string | null, tipo: string | null) {
        let carpetaId: ObjectId | null = null;
        if (idCarpeta !== null) {
            carpetaId = await this.verificarCarpeta(sesion, idCarpeta);
        }
        return await this.archivoDB.listar(new ObjectId(sesion.id), carpetaId, texto, tipo);
    }

    /** Devuelve los metadatos y el flujo de contenido para descargar el archivo. */
    async descargar(sesion: Sesion, idArchivo: string) {
        const archivo = await this.buscarArchivoPropio(sesion, idArchivo);
        const flujo = this.archivoDB.abrirContenido(archivo.gridfsId);
        await this.actividad.registrar(sesion.id, "DESCARGAR_ARCHIVO", "archivo", archivo._id!, archivo.nombre, null);
        return { archivo: archivo, flujo: flujo };
    }

    /**
     * Cambia el nombre del archivo (debe seguir terminando en .txt o .md).
     * @throws ErrorApp 409 si ya existe ese nombre en la carpeta
     */
    async renombrar(sesion: Sesion, idArchivo: string, nombreNuevo: unknown): Promise<void> {
        const nombre = this.validarNombre(nombreNuevo);
        const tipo = this.obtenerTipo(nombre);
        const archivo = await this.buscarArchivoPropio(sesion, idArchivo);

        if (await this.archivoDB.existeNombre(archivo.ownerId, archivo.carpetaId, nombre)) {
            throw new ErrorApp("Ya existe un archivo con ese nombre en la carpeta", 409);
        }
        await this.archivoDB.renombrar(archivo._id!, nombre, tipo);
        await this.actividad.registrar(sesion.id, "RENOMBRAR", "archivo", archivo._id!, nombre, "Antes: " + archivo.nombre);
    }

    /**
     * Mueve el archivo a otra carpeta (null = raíz).
     * @throws ErrorApp 409 si el destino ya tiene un archivo con ese nombre
     */
    async mover(sesion: Sesion, idArchivo: string, idCarpetaDestino: string | null): Promise<void> {
        const archivo = await this.buscarArchivoPropio(sesion, idArchivo);

        let destinoId: ObjectId | null = null;
        if (idCarpetaDestino !== null) {
            destinoId = await this.verificarCarpeta(sesion, idCarpetaDestino);
        }

        if (await this.archivoDB.existeNombre(archivo.ownerId, destinoId, archivo.nombre)) {
            throw new ErrorApp("Ya existe un archivo con ese nombre en el destino", 409);
        }
        await this.archivoDB.mover(archivo._id!, destinoId);
    }
}