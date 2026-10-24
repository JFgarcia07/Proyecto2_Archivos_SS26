import { ObjectId } from "mongodb";
import Conexion from "./Conexion.js";
import Usuario from "../Model/Usuario.js";

/** Acceso a datos de la colección "usuarios". */
export default class UsuarioDB {
  private get coleccion() {
    return Conexion.obtener().db.collection<Usuario>("usuarios");
  }

  /** Inserta un usuario. @return el _id generado por MongoDB. */
  async crear(u: Usuario) {
    const { _id, ...datos } = u;
    const r = await this.coleccion.insertOne(datos as Usuario);
    return r.insertedId;
  }

  /** Busca un usuario por correo. @return el usuario, o null si no existe. */
  async buscarPorEmail(email: string) {
    return this.coleccion.findOne({ email });
  }

  /** Busca un usuario por id. @return el usuario, o null si no existe. */
  async buscarPorId(id: ObjectId) {
    return this.coleccion.findOne({ _id: id });
  }

  /** Lista todos los usuarios ordenados por nombre. */
  async listarTodos() {
    return this.coleccion.find({}).sort({ nombre: 1 }).toArray();
  }

  /** Activa o desactiva un usuario (nunca se borra, para conservar su historial). */
  async cambiarActivo(id: ObjectId, activo: boolean) {
    await this.coleccion.updateOne({ _id: id }, { $set: { activo: activo } });
  }

  /** Crea el índice único sobre email para evitar usuarios duplicados. */
  async crearIndices() {
    await this.coleccion.createIndex({ email: 1 }, { unique: true });
  }
}