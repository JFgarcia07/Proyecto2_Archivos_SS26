import { MongoClient, Db } from "mongodb";

export default class Conexion {
  private static instancia: Conexion | null = null;
  private client: MongoClient;
  private _db: Db | null = null;

  private constructor() {
    this.client = new MongoClient(process.env.MONGO_URI as string);
  }

  static obtener(): Conexion {
    if (!Conexion.instancia) {
      Conexion.instancia = new Conexion();
    }
    return Conexion.instancia;
  }

  async conectar(): Promise<Db> {
    if (!this._db) {
      await this.client.connect();
      this._db = this.client.db(process.env.DB_NAME);
      console.log("Conectado a MongoDB");
    }
    return this._db;
  }

  get db(): Db {
    if (!this._db) throw new Error("Base de datos no conectada");
    return this._db;
  }
}