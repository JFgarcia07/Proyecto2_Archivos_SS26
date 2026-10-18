import "dotenv/config";
import bcrypt from "bcryptjs";
import Conexion from "./DB/Conexion.js";
import UsuarioDB from "./DB/UsuarioDB.js";
import Usuario from "./Model/Usuario.js";

await Conexion.obtener().conectar();
const db = new UsuarioDB();
await db.crearIndices();

const hash = await bcrypt.hash("123456", 10);
const usuarios = [
  new Usuario("Administrador", "admin@docs.com", hash, "ADMIN"),
  new Usuario("Usuario Uno", "uno@docs.com", hash, "USUARIO"),
  new Usuario("Usuario Dos", "dos@docs.com", hash, "USUARIO"),
];
for (const u of usuarios) {
  try { await db.crear(u); console.log("Creado:", u.email); }
  catch { console.log("Ya existe:", u.email); }
}
process.exit(0);