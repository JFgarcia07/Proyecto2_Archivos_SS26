import Conexion from "../DB/Conexion.js";
import  Usuario  from "../Model/Usuario.js";

export default class UsuarioDB {
    private get coleccion(){
        return Conexion.obtener().db.collection<Usuario>("usuarios");
    }

    async crear(u: Usuario) {
        const { _id, ...datos } = u;
        const r = await this.coleccion.insertOne(datos as Usuario);
        return r.insertedId;
    }

    async buscarPorEmail(email: string) {
    return this.coleccion.findOne({ email });
  }

  async crearIndices() {
    await this.coleccion.createIndex({ email: 1 }, { unique: true });
  }
}   