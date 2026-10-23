import { Collection, Filter, ObjectId } from "mongodb";
import Conexion from "./Conexion.js";
import Actividad from "../Model/Actividad.js"

/** Criterios opcionales para consultar el historial (null = no filtrar). */
export interface FiltroActividad {
  usuarioId: ObjectId | null;
  recursoId: ObjectId | null;
  accion: string | null;
  desde: Date | null;
  hasta: Date | null;
}

/** Acceso a datos de la colección "actividad". Solo consultas, sin reglas de negocio. */
export default class ActividadDB {

  private coleccion(): Collection<Actividad> {
    return Conexion.obtener().db.collection<Actividad>("actividad");
  }

  /** Inserta un registro de actividad. */
  async registrar(actividad: Actividad): Promise<void> {
    delete actividad._id;
    await this.coleccion().insertOne(actividad);
  }

  /**
   * Busca registros según el filtro, del más reciente al más antiguo.
   * @param limite cantidad máxima de registros a devolver
   */
  async buscar(filtro: FiltroActividad, limite: number): Promise<Actividad[]> {
    const consulta: Filter<Actividad> = {};

    if (filtro.usuarioId !== null) consulta.usuarioId = filtro.usuarioId;
    if (filtro.recursoId !== null) consulta.recursoId = filtro.recursoId;
    if (filtro.accion !== null) consulta.accion = filtro.accion;

    if (filtro.desde !== null || filtro.hasta !== null) {
      const rango: { $gte?: Date; $lte?: Date } = {};
      if (filtro.desde !== null) rango.$gte = filtro.desde;
      if (filtro.hasta !== null) rango.$lte = filtro.hasta;
      consulta.fecha = rango;
    }

    return await this.coleccion().find(consulta).sort({ fecha: -1 }).limit(limite).toArray();
  }

  /** Índices: historial por usuario, por recurso, por acción y por fecha (reportes). */
  async crearIndices(): Promise<void> {
    await this.coleccion().createIndex({ usuarioId: 1, fecha: -1 });
    await this.coleccion().createIndex({ recursoId: 1 });
    await this.coleccion().createIndex({ accion: 1 });
    await this.coleccion().createIndex({ fecha: 1 });
  }
}