import { ObjectId } from "mongodb";
import CarpetaDB from "../DB/CarpetaDB.js";
import Carpeta from "../Model/Carpeta.js";
import ErrorApp from "../Model/ErrorApp.js";
import { Sesion } from "../Middleware/AuthMiddleware.js";

/**
 * Reglas de negocio de las carpetas: nombre único por padre, acceso solo del
 * propietario y jerarquía sin ciclos.
*/
export default class CarpetaService {
    private carpetaDB: CarpetaDB = new CarpetaDB();

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
     * Busca la carpeta y verifica que sea del usuario y no esté en la papelera.
     * @throws ErrorApp 404 si no cumple
    */
    private async buscarCarpetaPropia(sesion: Sesion, idCarpeta: string): Promise<Carpeta> {
        const carpeta = await this.carpetaDB.buscarPorId(this.convertirId(idCarpeta));
        if (carpeta === null || carpeta.eliminada || carpeta.ownerId.toString() !== sesion.id) {
        throw new ErrorApp("Carpeta no encontrada", 404);
        }
        return carpeta;
    }

    /**
    * Crea una carpeta.
    * @param nombre nombre de la nueva carpeta
    * @param idPadre carpeta padre (null = raíz)
    * @throws ErrorApp 409 si ya existe ese nombre en el padre
    */
    async crear(sesion: Sesion, nombre: unknown, idPadre: string | null) {
        const nombreLimpio = this.validarNombre(nombre);
        const ownerId = new ObjectId(sesion.id);

        let padreId: ObjectId | null = null;
        let ancestros: ObjectId[] = [];

        if (idPadre !== null) {
        const padre = await this.buscarCarpetaPropia(sesion, idPadre);
        padreId = padre._id!;
        ancestros = [...padre.ancestros, padre._id!]; // ruta del padre + el padre
        }

        if (await this.carpetaDB.existeNombre(ownerId, padreId, nombreLimpio)) {
        throw new ErrorApp("Ya existe una carpeta con ese nombre aquí", 409);
        }

        const carpeta = new Carpeta(nombreLimpio, ownerId, padreId, ancestros);
        const id = await this.carpetaDB.crear(carpeta);
        return { id: id, nombre: nombreLimpio, parentId: padreId };
    }

    /** Lista las subcarpetas de una carpeta (null = raíz). */
    async listar(sesion: Sesion, idPadre: string | null): Promise<Carpeta[]> {
        let padreId: ObjectId | null = null;
        if (idPadre !== null) {
        const padre = await this.buscarCarpetaPropia(sesion, idPadre);
        padreId = padre._id!;
        }
        return await this.carpetaDB.listarHijos(new ObjectId(sesion.id), padreId);
    }

    /**
     * Cambia el nombre de la carpeta.
     * @throws ErrorApp 409 si ya existe ese nombre en el mismo padre
     */
    async renombrar(sesion: Sesion, idCarpeta: string, nombreNuevo: unknown): Promise<void> {
        const nombre = this.validarNombre(nombreNuevo);
        const carpeta = await this.buscarCarpetaPropia(sesion, idCarpeta);

        if (await this.carpetaDB.existeNombre(carpeta.ownerId, carpeta.parentId, nombre)) {
        throw new ErrorApp("Ya existe una carpeta con ese nombre aquí", 409);
        }
        await this.carpetaDB.renombrar(carpeta._id!, nombre);
    }

    /**
     * Mueve la carpeta a otro padre (null = raíz) y actualiza los ancestros de
     * todas sus subcarpetas.
     * @throws ErrorApp 400 si el destino es la misma carpeta o una de sus subcarpetas
     *         (provocaría un ciclo), 409 si el destino ya tiene ese nombre
     */
    async mover(sesion: Sesion, idCarpeta: string, idDestino: string | null): Promise<void> {
        const carpeta = await this.buscarCarpetaPropia(sesion, idCarpeta);

        let destinoId: ObjectId | null = null;
        let ancestrosNuevos: ObjectId[] = [];

        if (idDestino !== null) {
        const destino = await this.buscarCarpetaPropia(sesion, idDestino);

        // Evitar ciclos: el destino no puede ser la carpeta ni estar dentro de ella.
        const esLaMisma = destino._id!.equals(carpeta._id!);
        let estaDentro = false;
        for (let i = 0; i < destino.ancestros.length; i++) {
            if (destino.ancestros[i].equals(carpeta._id!)) {
            estaDentro = true;
            }
        }
        if (esLaMisma || estaDentro) {
            throw new ErrorApp("No se puede mover una carpeta dentro de sí misma o de sus subcarpetas", 400);
        }

        destinoId = destino._id!;
        ancestrosNuevos = [...destino.ancestros, destino._id!];
        }

        if (await this.carpetaDB.existeNombre(carpeta.ownerId, destinoId, carpeta.nombre)) {
        throw new ErrorApp("Ya existe una carpeta con ese nombre en el destino", 409);
        }

        const largoAnterior = carpeta.ancestros.length;
        await this.carpetaDB.mover(carpeta._id!, destinoId, ancestrosNuevos);

        // Cada subcarpeta conserva su ruta desde la carpeta movida hacia abajo
        // y solo cambia el prefijo (la ruta hasta la carpeta movida).
        const descendientes = await this.carpetaDB.buscarDescendientes(carpeta._id!);
        for (let i = 0; i < descendientes.length; i++) {
        const sub = descendientes[i];
        const cola = sub.ancestros.slice(largoAnterior);
        await this.carpetaDB.actualizarAncestros(sub._id!, [...ancestrosNuevos, ...cola]);
        }
    }
}