import { Db, Document, ObjectId } from "mongodb";
import Conexion from "./Conexion.js";

/**
 * Consultas de reportes. Todas usan el framework de agregación de MongoDB
 * ($match filtra, $group agrupa y cuenta, $sort ordena, $limit recorta,
 * $lookup une con otra colección, $project elige los campos de salida).
 * No hay reglas de negocio aquí: solo consultas.
 */
export default class ReporteDB {

    private db(): Db {
        return Conexion.obtener().db;
    }

    private filtroFecha(campo: string, desde: Date | null, hasta: Date | null): Record<string, unknown> {
        const filtro: Record<string, unknown> = {};
        if (desde !== null || hasta !== null) {
            const rango: Record<string, unknown> = {};
            if (desde !== null) rango["$gte"] = desde;
            if (hasta !== null) rango["$lte"] = hasta;
            filtro[campo] = rango;
        }
        return filtro;
    }


    /** 1. Cantidad de archivos activos agrupados por tipo (con el espacio que ocupan). */
    async archivosPorTipo(): Promise<Document[]> {
        return await this.db().collection("archivos").aggregate([
            { $match: { eliminado: false } },
            { $group: { _id: "$tipo", cantidad: { $sum: 1 }, tamanoTotal: { $sum: "$tamano" } } },
            { $sort: { cantidad: -1 } },
            { $project: { _id: 0, tipo: "$_id", cantidad: 1, tamanoTotal: 1 } },
        ]).toArray();
    }

    /** 2. Archivos activos almacenados dentro de un rango de fechas (máximo 500). */
    async archivosPorFechas(desde: Date | null, hasta: Date | null): Promise<Document[]> {
        return await this.db().collection("archivos").aggregate([
            { $match: Object.assign({ eliminado: false }, this.filtroFecha("fechaCreacion", desde, hasta)) },
            { $sort: { fechaCreacion: -1 } },
            { $limit: 500 },
            { $lookup: { from: "usuarios", localField: "ownerId", foreignField: "_id", as: "dueno" } },
            {
                $project: {
                    _id: 0, nombre: 1, tipo: 1, tamano: 1, fechaCreacion: 1,
                    propietario: { $arrayElemAt: ["$dueno.email", 0] },
                },
            },
        ]).toArray();
    }

    /**
     * 3. Archivos con mayor cantidad de operaciones registradas en el historial.
     * "existe" indica si el archivo sigue en la base (el historial conserva los eliminados).
     */
    async archivosConMasOperaciones(limite: number): Promise<Document[]> {
        return await this.db().collection("actividad").aggregate([
            { $match: { tipoRecurso: "archivo", recursoId: { $ne: null } } },
            { $sort: { fecha: 1 } }, // así $last toma el nombre más reciente
            { $group: { _id: "$recursoId", nombre: { $last: "$nombreRecurso" }, operaciones: { $sum: 1 } } },
            { $sort: { operaciones: -1 } },
            { $limit: limite },
            { $lookup: { from: "archivos", localField: "_id", foreignField: "_id", as: "actual" } },
            { $project: { _id: 0, nombre: 1, operaciones: 1, existe: { $gt: [{ $size: "$actual" }, 0] } } },
        ]).toArray();
    }

    /** 4. Top 10 usuarios con más archivos activos almacenados. */
    async usuariosConMasArchivos(): Promise<Document[]> {
        return await this.db().collection("archivos").aggregate([
            { $match: { eliminado: false } },
            { $group: { _id: "$ownerId", archivos: { $sum: 1 }, tamanoTotal: { $sum: "$tamano" } } },
            { $sort: { archivos: -1 } },
            { $limit: 10 },
            { $lookup: { from: "usuarios", localField: "_id", foreignField: "_id", as: "u" } },
            {
                $project: {
                    _id: 0, archivos: 1, tamanoTotal: 1,
                    nombre: { $arrayElemAt: ["$u.nombre", 0] },
                    email: { $arrayElemAt: ["$u.email", 0] },
                },
            },
        ]).toArray();
    }

    /**
     * 5. Usuarios con mayor cantidad de recursos compartidos.
     * "recursosCompartidos" cuenta recursos distintos; "comparticiones" cuenta cada acceso concedido.
     */
    async usuariosConMasCompartidos(): Promise<Document[]> {
        return await this.db().collection("comparticiones").aggregate([
            { $group: { _id: "$ownerId", recursos: { $addToSet: "$recursoId" }, comparticiones: { $sum: 1 } } },
            { $project: { recursosCompartidos: { $size: "$recursos" }, comparticiones: 1 } },
            { $sort: { recursosCompartidos: -1, comparticiones: -1 } },
            { $limit: 10 },
            { $lookup: { from: "usuarios", localField: "_id", foreignField: "_id", as: "u" } },
            {
                $project: {
                    _id: 0, recursosCompartidos: 1, comparticiones: 1,
                    nombre: { $arrayElemAt: ["$u.nombre", 0] },
                    email: { $arrayElemAt: ["$u.email", 0] },
                },
            },
        ]).toArray();
    }


    /** 6. Archivos compartidos con la mayor cantidad de usuarios. */
    async archivosMasCompartidos(): Promise<Document[]> {
        return await this.db().collection("comparticiones").aggregate([
            { $match: { tipoRecurso: "archivo" } },
            { $group: { _id: "$recursoId", usuarios: { $sum: 1 } } },
            { $sort: { usuarios: -1 } },
            { $limit: 10 },
            { $lookup: { from: "archivos", localField: "_id", foreignField: "_id", as: "archivo" } },
            { $project: { _id: 0, usuarios: 1, nombre: { $arrayElemAt: ["$archivo.nombre", 0] } } },
        ]).toArray();
    }

    /**
     * 7 y 8. Comparticiones de un usuario.
     * @param campo "ownerId" = lo que compartió; "destinatarioId" = lo que recibió
     * @return cada fila trae el nombre del recurso y el correo de la otra persona
     */
    async comparticionesDe(campo: "ownerId" | "destinatarioId", usuarioId: ObjectId): Promise<Document[]> {
        const otro = campo === "ownerId" ? "destinatarioId" : "ownerId";
        return await this.db().collection("comparticiones").aggregate([
            { $match: { [campo]: usuarioId } },
            { $sort: { fechaCreacion: -1 } },
            { $lookup: { from: "usuarios", localField: otro, foreignField: "_id", as: "otroUsuario" } },
            { $lookup: { from: "archivos", localField: "recursoId", foreignField: "_id", as: "archivo" } },
            { $lookup: { from: "carpetas", localField: "recursoId", foreignField: "_id", as: "carpeta" } },
            {
                $project: {
                    _id: 0, tipoRecurso: 1, permiso: 1, fecha: "$fechaCreacion",
                    usuario: { $arrayElemAt: ["$otroUsuario.email", 0] },
                    nombre: {
                        $ifNull: [{ $arrayElemAt: ["$archivo.nombre", 0] }, { $arrayElemAt: ["$carpeta.nombre", 0] }],
                    },
                },
            },
        ]).toArray();
    }


    /** 10. Cantidad de operaciones agrupadas por tipo de acción. */
    async operacionesPorTipo(desde: Date | null, hasta: Date | null): Promise<Document[]> {
        return await this.db().collection("actividad").aggregate([
            { $match: this.filtroFecha("fecha", desde, hasta) },
            { $group: { _id: "$accion", cantidad: { $sum: 1 } } },
            { $sort: { cantidad: -1 } },
            { $project: { _id: 0, accion: "$_id", cantidad: 1 } },
        ]).toArray();
    }

    /**
     * 11. Cantidad de operaciones agrupadas por período.
     * @param periodo "dia" o "mes"
     */
    async operacionesPorPeriodo(periodo: string, desde: Date | null, hasta: Date | null): Promise<Document[]> {
        const formato = periodo === "mes" ? "%Y-%m" : "%Y-%m-%d";
        return await this.db().collection("actividad").aggregate([
            { $match: this.filtroFecha("fecha", desde, hasta) },
            {
                $group: {
                    _id: { $dateToString: { format: formato, date: "$fecha", timezone: "America/Guatemala" } },
                    cantidad: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, periodo: "$_id", cantidad: 1 } },
        ]).toArray();
    }

    /** 12. Principales acciones del sistema: las 10 combinaciones usuario + acción más frecuentes. */
    async principalesAcciones(desde: Date | null, hasta: Date | null): Promise<Document[]> {
        return await this.db().collection("actividad").aggregate([
            { $match: this.filtroFecha("fecha", desde, hasta) },
            { $group: { _id: { usuarioId: "$usuarioId", accion: "$accion" }, cantidad: { $sum: 1 } } },
            { $sort: { cantidad: -1 } },
            { $limit: 10 },
            { $lookup: { from: "usuarios", localField: "_id.usuarioId", foreignField: "_id", as: "u" } },
            {
                $project: {
                    _id: 0, cantidad: 1, accion: "$_id.accion",
                    email: { $arrayElemAt: ["$u.email", 0] },
                },
            },
        ]).toArray();
    }

}