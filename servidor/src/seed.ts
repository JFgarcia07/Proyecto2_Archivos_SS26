import "dotenv/config";
import bcrypt from "bcryptjs";
import Conexion from "./DB/Conexion.js";
import UsuarioDB from "./DB/UsuarioDB.js";
import CarpetaDB from "./DB/CarpetaDB.js";
import ArchivoDB from "./DB/ArchivoDB.js";
import Usuario from "./Model/Usuario.js";
import ComparticionDB from "./DB/ComparticionDB.js";

/**
 * Carga inicial: crea los índices y los 3 usuarios.
 * Se puede ejecutar varias veces: los usuarios que ya existen se omiten.
 */
await Conexion.obtener().conectar();

const usuarioDB = new UsuarioDB();
await usuarioDB.crearIndices();
await new CarpetaDB().crearIndices();
await new ArchivoDB().crearIndices();
await new ComparticionDB().crearIndices();
console.log("Índices creados");

const hash = await bcrypt.hash("123456", 10);
const usuarios: Usuario[] = [
  new Usuario("Administrador", "admin@docs.com", hash, "ADMIN"),
  new Usuario("Usuario Uno", "uno@docs.com", hash, "USUARIO"),
  new Usuario("Usuario Dos", "dos@docs.com", hash, "USUARIO"),
];

for (let i = 0; i < usuarios.length; i++) {
  try {
    await usuarioDB.crear(usuarios[i]);
    console.log("Creado: " + usuarios[i].email);
  } catch (error) {
    console.log("Ya existe: " + usuarios[i].email);
  }
}

process.exit(0);