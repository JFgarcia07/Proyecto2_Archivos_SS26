import { ObjectId } from "mongodb";
import ComparticionDB from "../DB/ComparticionDB.js";
import CarpetaDB from "../DB/CarpetaDB.js";
import ArchivoDB from "../DB/ArchivoDB.js";
import UsuarioDB from "../DB/UsuarioDB.js";
import Comparticion, { Permiso, TipoRecurso } from "../Model/Comparticion.js";
import Carpeta from "../Model/Carpeta.js";
import Archivo from "../Model/Archivo.js";
import ErrorApp from "../Model/ErrorApp.js";
import AccesoService, { Nivel } from "./AccesoService.js";
import { Sesion } from "../Middleware/AuthMiddleware.js";
import ActividadService from "./ActividadService.js";

/**
 * Reglas de compartición: solo el dueño comparte, cambia permisos o retira accesos.
 * Quien recibe un recurso puede consultarlo (y editarlo si tiene permiso de edición).
 */
export default class ComparticionService {
    private comparticionDB: ComparticionDB = new ComparticionDB();
    private carpetaDB: CarpetaDB = new CarpetaDB();
    private archivoDB: ArchivoDB = new ArchivoDB();
    private usuarioDB: UsuarioDB = new UsuarioDB();
    private acceso: AccesoService = new AccesoService();
    private actividad: ActividadService = new ActividadService();

    private convertirId(id: string): ObjectId {
        if (!ObjectId.isValid(id)) {
            throw new ErrorApp("Identificador inválido", 400);
        }
        return new ObjectId(id);
    }

    private validarPermiso(permiso: unknown): Permiso {
        if (permiso === "lectura" || permiso === "comentar" || permiso === "edicion") {
            return permiso;
        }
        throw new ErrorApp("Permiso inválido (lectura, comentar o edicion)", 400);
    }

    private validarTipo(tipo: unknown): TipoRecurso {
        if (tipo === "archivo" || tipo === "carpeta") {
            return tipo;
        }
        throw new ErrorApp("Tipo de recurso inválido (archivo o carpeta)", 400);
    }

    /**
     * Busca una carpeta y verifica que el usuario tenga al menos el nivel indicado.
     * @throws ErrorApp 404 si no existe o no tiene acceso, 403 si el nivel no alcanza
     */
    private async buscarCarpeta(sesion: Sesion, id: string, nivelMinimo: number): Promise<Carpeta> {
        const carpeta = await this.carpetaDB.buscarPorId(this.convertirId(id));
        if (carpeta === null || carpeta.eliminada) {
            throw new ErrorApp("Carpeta no encontrada", 404);
        }
        const nivel = await this.acceso.nivelSobreCarpeta(sesion, carpeta);
        if (nivel === Nivel.NINGUNO) {
            throw new ErrorApp("Carpeta no encontrada", 404);
        }
        if (nivel < nivelMinimo) {
            throw new ErrorApp("No tienes permiso para esta operación", 403);
        }
        return carpeta;
    }

    /** Igual que buscarCarpeta, pero para archivos. */
    private async buscarArchivo(sesion: Sesion, id: string, nivelMinimo: number): Promise<Archivo> {
        const archivo = await this.archivoDB.buscarPorId(this.convertirId(id));
        if (archivo === null || archivo.eliminado) {
            throw new ErrorApp("Archivo no encontrado", 404);
        }
        const nivel = await this.acceso.nivelSobreArchivo(sesion, archivo);
        if (nivel === Nivel.NINGUNO) {
            throw new ErrorApp("Archivo no encontrado", 404);
        }
        if (nivel < nivelMinimo) {
            throw new ErrorApp("No tienes permiso para esta operación", 403);
        }
        return archivo;
    }

    /** Nombre del recurso compartido, o null si ya no existe o está en la papelera. */
    private async nombreRecurso(comparticion: Comparticion): Promise<string | null> {
        if (comparticion.tipoRecurso === "carpeta") {
            const carpeta = await this.carpetaDB.buscarPorId(comparticion.recursoId);
            if (carpeta === null || carpeta.eliminada) return null;
            return carpeta.nombre;
        }
        const archivo = await this.archivoDB.buscarPorId(comparticion.recursoId);
        if (archivo === null || archivo.eliminado) return null;
        return archivo.nombre;
    }

    /**
     * Comparte un recurso con otro usuario. Si ya estaba compartido, actualiza el permiso.
     * @param email correo del usuario destinatario
     * @throws ErrorApp 403 si no es el dueño, 404 si el destinatario no existe o está inactivo,
     *         400 si intenta compartir consigo mismo
     */
    async compartir(sesion: Sesion, tipo: unknown, idRecurso: string, email: unknown, permiso: unknown) {
        const tipoRecurso = this.validarTipo(tipo);
        const permisoValido = this.validarPermiso(permiso);
        if (typeof email !== "string" || email.trim() === "") {
            throw new ErrorApp("El correo del destinatario es requerido", 400);
        }

        let recursoId: ObjectId;
        let nombreRecurso: string;
        if (tipoRecurso === "carpeta") {
            const carpeta = await this.buscarCarpeta(sesion, idRecurso, Nivel.DUENO);
            recursoId = carpeta._id!;
            nombreRecurso = carpeta.nombre;
        } else {
            const archivo = await this.buscarArchivo(sesion, idRecurso, Nivel.DUENO);
            recursoId = archivo._id!;
            nombreRecurso = archivo.nombre;
        }

        const destinatario = await this.usuarioDB.buscarPorEmail(email.trim());
        if (destinatario === null || !destinatario.activo) {
            throw new ErrorApp("Usuario destinatario no encontrado", 404);
        }
        if (destinatario._id!.toString() === sesion.id) {
            throw new ErrorApp("No puedes compartir un recurso contigo mismo", 400);
        }

        const detalle = "Con " + destinatario.email + " (" + permisoValido + ")";
        const existente = await this.comparticionDB.buscarExistente(recursoId, destinatario._id!);

        if (existente !== null) {
            await this.comparticionDB.cambiarPermiso(existente._id!, permisoValido);
            await this.actividad.registrar(sesion.id, "CAMBIAR_PERMISO", tipoRecurso, recursoId, nombreRecurso, detalle);
            return { id: existente._id, actualizado: true };
        }

        const nueva = new Comparticion(tipoRecurso, recursoId, new ObjectId(sesion.id), destinatario._id!, permisoValido);
        const id = await this.comparticionDB.crear(nueva);
        await this.actividad.registrar(sesion.id, "COMPARTIR", tipoRecurso, recursoId, nombreRecurso, detalle);
        return { id: id, actualizado: false };
    }

    /** Busca una compartición y verifica que el usuario sea quien la creó (el dueño). */
    private async buscarComparticionPropia(sesion: Sesion, id: string): Promise<Comparticion> {
        const comparticion = await this.comparticionDB.buscarPorId(this.convertirId(id));
        if (comparticion === null || comparticion.ownerId.toString() !== sesion.id) {
            throw new ErrorApp("Compartición no encontrada", 404);
        }
        return comparticion;
    }

    /** Cambia el permiso concedido. */
    async cambiarPermiso(sesion: Sesion, idComparticion: string, permiso: unknown): Promise<void> {
        const permisoValido = this.validarPermiso(permiso);
        const comparticion = await this.buscarComparticionPropia(sesion, idComparticion);
        await this.comparticionDB.cambiarPermiso(comparticion._id!, permisoValido);
        const nombre = await this.nombreRecurso(comparticion);
        await this.actividad.registrar(sesion.id, "CAMBIAR_PERMISO", comparticion.tipoRecurso, comparticion.recursoId, nombre, "Nuevo permiso: " + permisoValido);
    }

    /** Retira el acceso concedido. */
    async retirar(sesion: Sesion, idComparticion: string): Promise<void> {
        const comparticion = await this.buscarComparticionPropia(sesion, idComparticion);
        await this.comparticionDB.eliminar(comparticion._id!);
        const nombre = await this.nombreRecurso(comparticion);
        await this.actividad.registrar(sesion.id, "RETIRAR_ACCESO", comparticion.tipoRecurso, comparticion.recursoId, nombre, null);
    }

    /** Lista lo que el usuario compartió con otros (sin recursos en la papelera). */
    async listarEnviadas(sesion: Sesion) {
        const lista = await this.comparticionDB.listarEnviadas(new ObjectId(sesion.id));
        const resultado: any[] = [];

        for (let i = 0; i < lista.length; i++) {
            const nombre = await this.nombreRecurso(lista[i]);
            if (nombre === null) continue;
            const destinatario = await this.usuarioDB.buscarPorId(lista[i].destinatarioId);
            resultado.push({
                _id: lista[i]._id,
                tipoRecurso: lista[i].tipoRecurso,
                recursoId: lista[i].recursoId,
                nombre: nombre,
                destinatario: destinatario !== null ? destinatario.email : "(usuario eliminado)",
                permiso: lista[i].permiso,
                fecha: lista[i].fechaCreacion,
            });
        }
        return resultado;
    }

    /** Lista lo que otros compartieron con el usuario (sin recursos en la papelera). */
    async listarRecibidas(sesion: Sesion) {
        const lista = await this.comparticionDB.listarRecibidas(new ObjectId(sesion.id));
        const resultado: any[] = [];

        for (let i = 0; i < lista.length; i++) {
            const nombre = await this.nombreRecurso(lista[i]);
            if (nombre === null) continue;
            const propietario = await this.usuarioDB.buscarPorId(lista[i].ownerId);
            resultado.push({
                _id: lista[i]._id,
                tipoRecurso: lista[i].tipoRecurso,
                recursoId: lista[i].recursoId,
                nombre: nombre,
                propietario: propietario !== null ? propietario.nombre : "(usuario eliminado)",
                permiso: lista[i].permiso,
                fecha: lista[i].fechaCreacion,
            });
        }
        return resultado;
    }

    /**
     * Contenido de una carpeta compartida: subcarpetas y archivos.
     * @throws ErrorApp 404 si no tiene acceso
     */
    async contenidoCarpeta(sesion: Sesion, idCarpeta: string) {
        const carpeta = await this.buscarCarpeta(sesion, idCarpeta, Nivel.LECTURA);
        const nivel = await this.acceso.nivelSobreCarpeta(sesion, carpeta);
        const subcarpetas = await this.carpetaDB.listarHijosDe(carpeta._id!);
        const archivos = await this.archivoDB.listarDeCarpeta(carpeta._id!);

        return {
            carpeta: { _id: carpeta._id, nombre: carpeta.nombre },
            puedeEditar: nivel >= Nivel.EDICION,
            subcarpetas: subcarpetas,
            archivos: archivos,
        };
    }

    /** Datos y flujo de contenido de un archivo al que el usuario tiene acceso de lectura. */
    async descargar(sesion: Sesion, idArchivo: string) {
        const archivo = await this.buscarArchivo(sesion, idArchivo, Nivel.LECTURA);
        await this.actividad.registrar(sesion.id, "DESCARGAR_ARCHIVO", "archivo", archivo._id!, archivo.nombre, "Archivo compartido");
        return { archivo: archivo, flujo: this.archivoDB.abrirContenido(archivo.gridfsId) };
    }

    /**
     * Renombra un archivo compartido. Requiere permiso de edición.
     * @throws ErrorApp 403 sin permiso, 400 si no termina en .txt o .md, 409 si el nombre existe
     */
    async renombrarArchivo(sesion: Sesion, idArchivo: string, nombreNuevo: unknown): Promise<void> {
        if (typeof nombreNuevo !== "string" || nombreNuevo.trim() === "") {
            throw new ErrorApp("El nombre es requerido", 400);
        }
        const nombre = nombreNuevo.trim();
        const punto = nombre.lastIndexOf(".");
        const extension = punto >= 0 ? nombre.substring(punto + 1).toLowerCase() : "";
        if (extension !== "txt" && extension !== "md") {
            throw new ErrorApp("Solo se permiten archivos .txt y .md", 400);
        }

        const archivo = await this.buscarArchivo(sesion, idArchivo, Nivel.EDICION);
        if (await this.archivoDB.existeNombre(archivo.ownerId, archivo.carpetaId, nombre)) {
            throw new ErrorApp("Ya existe un archivo con ese nombre en la carpeta", 409);
        }
        await this.archivoDB.renombrar(archivo._id!, nombre, extension);
        await this.actividad.registrar(sesion.id, "RENOMBRAR", "archivo", archivo._id!, nombre, "Antes: " + archivo.nombre);
    }
}