import { Collection, ObjectId } from "mongodb";
import Conexion from "./Conexion.js";
import Comparticion, { Permiso } from "../Model/Comparticion.js";

export default class ComparticionDB {

    private coleccion(): Collection<Comparticion> {
        return Conexion.obtener().db.collection<Comparticion>("Comparticion");
    }

    /** Inserta una compartición. @return el id generado. */
    async crear(comparticion: Comparticion): Promise<ObjectId> {
        delete comparticion._id;
        const resultado = await this.coleccion().insertOne(comparticion);
        return resultado.insertedId;
    }

    async buscarPorId(id: ObjectId): Promise<Comparticion | null> {
        return await this.coleccion().findOne({ _id: id });
    }

    /** Busca si un recurso ya está compartido con ese usuario. */
    async buscarExistente(recursoId: ObjectId, destinatarioId: ObjectId): Promise<Comparticion | null> {
        return await this.coleccion().findOne({ recursoId: recursoId, destinatarioId: destinatarioId });
    }

    /** Busca las comparticiones que un usuario tiene sobre cualquiera de los recursos indicados. */
    async buscarPorRecursos(recursoIds: ObjectId[], destinatarioId: ObjectId): Promise<Comparticion[]> {
        return await this.coleccion()
            .find({ recursoId: { $in: recursoIds }, destinatarioId: destinatarioId })
            .toArray();
    }

    /** Lo que el usuario ha compartido con otros. */
    async listarEnviadas(ownerId: ObjectId): Promise<Comparticion[]> {
        return await this.coleccion().find({ ownerId: ownerId }).sort({ fechaCreacion: -1 }).toArray();
    }

    /** Lo que otros han compartido con el usuario. */
    async listarRecibidas(destinatarioId: ObjectId): Promise<Comparticion[]> {
        return await this.coleccion().find({ destinatarioId: destinatarioId }).sort({ fechaCreacion: -1 }).toArray();
    }

    async cambiarPermiso(id: ObjectId, permiso: Permiso): Promise<void> {
        await this.coleccion().updateOne({ _id: id }, { $set: { permiso: permiso } });
    }

    async eliminar(id: ObjectId): Promise<void> {
        await this.coleccion().deleteOne({ _id: id });
    }

    /** Borra las comparticiones de recursos que se eliminaron definitivamente. */
    async eliminarPorRecursos(recursoIds: ObjectId[]): Promise<void> {
        await this.coleccion().deleteMany({ recursoId: { $in: recursoIds } });
    }

    /** Índices: un recurso se comparte una sola vez por usuario, y búsquedas por usuario. */
    async crearIndices(): Promise<void> {
        await this.coleccion().createIndex({ recursoId: 1, destinatarioId: 1 }, { unique: true });
        await this.coleccion().createIndex({ destinatarioId: 1 });
        await this.coleccion().createIndex({ ownerId: 1 });
    }

}