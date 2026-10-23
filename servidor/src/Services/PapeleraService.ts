import { ObjectId } from "mongodb";
import CarpetaDB from "../DB/CarpetaDB.js";
import ArchivoDB from "../DB/ArchivoDB.js";
import Carpeta from "../Model/Carpeta.js";
import Archivo from "../Model/Archivo.js";
import ErrorApp from "../Model/ErrorApp.js";
import { Sesion } from "../Middleware/AuthMiddleware.js";
import ComparticionDB from "../DB/ComparticionDB.js";
import ActividadService from "./ActividadService.js";


/**
 * Reglas de la papelera: enviar, consultar, restaurar y eliminar definitivamente.
 * Solo el propietario puede operar sobre sus elementos.
 */
export default class PapeleraService {
    private carpetaDB: CarpetaDB = new CarpetaDB();
    private archivoDB: ArchivoDB = new ArchivoDB();
    private comparticionDB: ComparticionDB = new ComparticionDB();
    private actividad: ActividadService = new ActividadService();

    /** Convierte un texto en ObjectId. @throws ErrorApp 400 si no es válido. */
    private convertirId(id: string): ObjectId {
        if (!ObjectId.isValid(id)) {
            throw new ErrorApp("Identificador inválido", 400);
        }
        return new ObjectId(id);
    }

    /**
     * Busca una carpeta del usuario en el estado indicado.
     * @param enPapelera true para buscar entre las eliminadas, false entre las activas
     * @throws ErrorApp 404 si no existe, no es suya o está en otro estado
     */
    private async buscarCarpeta(sesion: Sesion, id: string, enPapelera: boolean): Promise<Carpeta> {
        const carpeta = await this.carpetaDB.buscarPorId(this.convertirId(id));
        if (carpeta === null || carpeta.ownerId.toString() !== sesion.id || carpeta.eliminada !== enPapelera) {
            throw new ErrorApp("Carpeta no encontrada", 404);
        }
        return carpeta;
    }

    /** Igual que buscarCarpeta, pero para archivos. */
    private async buscarArchivo(sesion: Sesion, id: string, enPapelera: boolean): Promise<Archivo> {
        const archivo = await this.archivoDB.buscarPorId(this.convertirId(id));
        if (archivo === null || archivo.ownerId.toString() !== sesion.id || archivo.eliminado !== enPapelera) {
            throw new ErrorApp("Archivo no encontrado", 404);
        }
        return archivo;
    }

    /** Devuelve el id de la carpeta más los ids de todas sus subcarpetas. */
    private async idsConDescendientes(carpeta: Carpeta): Promise<ObjectId[]> {
        const ids: ObjectId[] = [carpeta._id!];
        const descendientes = await this.carpetaDB.buscarDescendientes(carpeta._id!);
        for (let i = 0; i < descendientes.length; i++) {
            ids.push(descendientes[i]._id!);
        }
        return ids;
    }

    /** Envía una carpeta, sus subcarpetas y todos sus archivos a la papelera. */
    async enviarCarpeta(sesion: Sesion, idCarpeta: string): Promise<void> {
        const carpeta = await this.buscarCarpeta(sesion, idCarpeta, false);
        const ids = await this.idsConDescendientes(carpeta);
        const fecha = new Date();

        await this.carpetaDB.enviarAPapelera(carpeta._id!, fecha);
        await this.archivoDB.enviarPorCarpetas(ids, fecha);
        await this.actividad.registrar(sesion.id, "ELIMINAR", "carpeta", carpeta._id!, carpeta.nombre, "Enviada a la papelera");
    }

    /** Envía un archivo a la papelera. */
    async enviarArchivo(sesion: Sesion, idArchivo: string): Promise<void> {
        const archivo = await this.buscarArchivo(sesion, idArchivo, false);
        await this.archivoDB.enviarAPapelera(archivo._id!, new Date());
        await this.actividad.registrar(sesion.id, "ELIMINAR", "archivo", archivo._id!, archivo.nombre, "Enviado a la papelera");
    }

    /** Lista lo que el usuario eliminó directamente: carpetas y archivos. */
    async listar(sesion: Sesion) {
        const ownerId = new ObjectId(sesion.id);
        const carpetas = await this.carpetaDB.listarEliminadasDirectas(ownerId);
        const archivos = await this.archivoDB.listarEliminadosDirectos(ownerId);
        return { carpetas: carpetas, archivos: archivos };
    }

    /**
     * Restaura una carpeta con todo lo que se fue con ella.
     * @throws ErrorApp 409 si su carpeta padre sigue en la papelera o el nombre ya está en uso
     */
    async restaurarCarpeta(sesion: Sesion, idCarpeta: string): Promise<void> {
        const carpeta = await this.buscarCarpeta(sesion, idCarpeta, true);

        if (carpeta.parentId !== null) {
            const padre = await this.carpetaDB.buscarPorId(carpeta.parentId);
            if (padre === null || padre.eliminada) {
                throw new ErrorApp("Restaura primero la carpeta que la contiene", 409);
            }
        }
        if (await this.carpetaDB.existeNombre(carpeta.ownerId, carpeta.parentId, carpeta.nombre)) {
            throw new ErrorApp("Ya existe una carpeta con ese nombre en su ubicación original", 409);
        }

        const ids = await this.idsConDescendientes(carpeta);
        await this.carpetaDB.restaurar(carpeta._id!, carpeta.fechaEliminacion!);
        await this.archivoDB.restaurarPorCarpetas(ids, carpeta.fechaEliminacion!);
        await this.actividad.registrar(sesion.id, "RESTAURAR", "carpeta", carpeta._id!, carpeta.nombre, null);
    }

    /**
     * Restaura un archivo a su carpeta original.
     * @throws ErrorApp 409 si su carpeta sigue en la papelera o el nombre ya está en uso
     */
    async restaurarArchivo(sesion: Sesion, idArchivo: string): Promise<void> {
        const archivo = await this.buscarArchivo(sesion, idArchivo, true);

        if (archivo.carpetaId !== null) {
            const carpeta = await this.carpetaDB.buscarPorId(archivo.carpetaId);
            if (carpeta === null || carpeta.eliminada) {
                throw new ErrorApp("Restaura primero la carpeta que lo contiene", 409);
            }
        }
        if (await this.archivoDB.existeNombre(archivo.ownerId, archivo.carpetaId, archivo.nombre)) {
            throw new ErrorApp("Ya existe un archivo con ese nombre en su ubicación original", 409);
        }
        await this.archivoDB.restaurar(archivo._id!);
        await this.actividad.registrar(sesion.id, "RESTAURAR", "archivo", archivo._id!, archivo.nombre, null);
    }

    /** Elimina para siempre una carpeta, sus subcarpetas y todos sus archivos (incluido el contenido). */
    async eliminarCarpetaDefinitivo(sesion: Sesion, idCarpeta: string): Promise<void> {
        const carpeta = await this.buscarCarpeta(sesion, idCarpeta, true);
        const ids = await this.idsConDescendientes(carpeta);
        const archivos = await this.archivoDB.listarPorCarpetas(ids);

        const idsRecursos: ObjectId[] = [...ids];
        for (let i = 0; i < archivos.length; i++) {
            idsRecursos.push(archivos[i]._id!);
        }
        await this.comparticionDB.eliminarPorRecursos(idsRecursos);

        await this.archivoDB.eliminarDefinitivo(archivos);
        await this.carpetaDB.eliminarDefinitivo(ids);
        await this.actividad.registrar(sesion.id, "ELIMINAR_DEFINITIVO", "carpeta", carpeta._id!, carpeta.nombre, null);
    }

    /** Elimina para siempre un archivo y su contenido en GridFS. */
    async eliminarArchivoDefinitivo(sesion: Sesion, idArchivo: string): Promise<void> {
        const archivo = await this.buscarArchivo(sesion, idArchivo, true);
        await this.comparticionDB.eliminarPorRecursos([archivo._id!]);
        await this.archivoDB.eliminarDefinitivo([archivo]);
        await this.actividad.registrar(sesion.id, "ELIMINAR_DEFINITIVO", "archivo", archivo._id!, archivo.nombre, null);
    }
}