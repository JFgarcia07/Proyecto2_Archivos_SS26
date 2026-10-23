import "dotenv/config";
import bcrypt from "bcryptjs";
import { GridFSBucket, ObjectId } from "mongodb";
import Conexion from "./DB/Conexion.js";
import UsuarioDB from "./DB/UsuarioDB.js";
import CarpetaDB from "./DB/CarpetaDB.js";
import ArchivoDB from "./DB/ArchivoDB.js";
import ComparticionDB from "./DB/ComparticionDB.js";
import ActividadDB from "./DB/ActividadDB.js";
import Usuario from "./Model/Usuario.js";
import Carpeta from "./Model/Carpeta.js";
import Archivo from "./Model/Archivo.js";
import Comparticion, { Permiso, TipoRecurso } from "./Model/Comparticion.js";
import Actividad from "./Model/Actividad.js";

/**
 * Carga inicial del sistema.
 * Crea índices, usuarios, carpetas, archivos (con contenido en GridFS),
 * comparticiones, elementos en la papelera e historial de actividad.
 * Se puede ejecutar varias veces: borra y vuelve a cargar todo menos los usuarios.
 */

// ---------- Definición de los datos ----------

interface UsuarioSemilla {
  clave: string;
  nombre: string;
  email: string;
  rol: "ADMIN" | "USUARIO";
}

/** Carpetas (padres antes que hijos) y archivos [carpeta, nombre] de un usuario. "" = raíz. */
interface PlanUsuario {
  clave: string;
  carpetas: string[];
  archivos: [string, string][];
}

interface ComparticionSemilla {
  tipo: TipoRecurso;
  dueno: string;
  ruta: string;
  destino: string;
  permiso: Permiso;
}

const usuariosSemilla: UsuarioSemilla[] = [
  { clave: "admin", nombre: "Administrador", email: "admin@docs.com", rol: "ADMIN" },
  { clave: "uno", nombre: "Usuario Uno", email: "uno@docs.com", rol: "USUARIO" },
  { clave: "dos", nombre: "Usuario Dos", email: "dos@docs.com", rol: "USUARIO" },
];

const planes: PlanUsuario[] = [
  {
    clave: "uno",
    carpetas: [
      "Contratos", "Contratos/Clientes", "Contratos/Proveedores",
      "Informes", "Informes/2025", "Informes/2026",
      "Administrativo", "Borradores",
    ],
    archivos: [
      ["", "notas-personales.txt"], ["", "pendientes.md"], ["", "viejo-memo.txt"],
      ["Contratos", "contrato-marco.md"], ["Contratos", "terminos-generales.txt"],
      ["Contratos/Clientes", "contrato-cliente-a.md"], ["Contratos/Clientes", "contrato-cliente-b.md"],
      ["Contratos/Clientes", "anexo-cliente-a.txt"],
      ["Contratos/Proveedores", "contrato-proveedor-1.md"], ["Contratos/Proveedores", "contrato-proveedor-2.txt"],
      ["Contratos/Proveedores", "condiciones-pago.txt"],
      ["Informes", "resumen-anual.md"], ["Informes", "indicadores.txt"],
      ["Informes/2025", "informe-q1-2025.md"], ["Informes/2025", "informe-q2-2025.md"],
      ["Informes/2025", "informe-q3-2025.txt"],
      ["Informes/2026", "informe-q1-2026.md"], ["Informes/2026", "informe-q2-2026.txt"],
      ["Informes/2026", "informe-q3-2026.md"],
      ["Administrativo", "memo-interno.txt"], ["Administrativo", "acta-reunion.md"],
      ["Borradores", "borrador-contrato.md"], ["Borradores", "borrador-informe.txt"],
    ],
  },
  {
    clave: "dos",
    carpetas: ["Proyectos", "Proyectos/Alfa", "Proyectos/Beta", "Reuniones", "Personal", "Pruebas"],
    archivos: [
      ["", "ideas.md"], ["", "bitacora.txt"], ["", "duplicado.md"],
      ["Proyectos", "plan-general.md"], ["Proyectos", "presupuesto.txt"],
      ["Proyectos/Alfa", "requerimientos-alfa.md"], ["Proyectos/Alfa", "diseno-alfa.md"],
      ["Proyectos/Alfa", "pruebas-alfa.txt"],
      ["Proyectos/Beta", "requerimientos-beta.md"], ["Proyectos/Beta", "cronograma-beta.txt"],
      ["Proyectos/Beta", "riesgos-beta.md"],
      ["Reuniones", "agenda-lunes.txt"], ["Reuniones", "acta-semana-1.md"],
      ["Reuniones", "acta-semana-2.md"], ["Reuniones", "acta-semana-3.txt"],
      ["Reuniones", "acta-semana-4.md"],
      ["Personal", "curriculum.md"], ["Personal", "metas.txt"], ["Personal", "lecturas.md"],
      ["Personal", "recordatorios.txt"], ["Personal", "viajes.md"],
      ["Pruebas", "prueba-1.txt"], ["Pruebas", "prueba-2.md"],
    ],
  },
  {
    clave: "admin",
    carpetas: ["Políticas", "Auditoría", "Auditoría/Reportes"],
    archivos: [
      ["", "bienvenida.md"], ["", "obsoleto.txt"],
      ["Políticas", "politica-uso.md"], ["Políticas", "politica-respaldo.txt"],
      ["Políticas", "politica-privacidad.md"],
      ["Auditoría", "plan-auditoria.md"], ["Auditoría", "checklist.txt"],
      ["Auditoría/Reportes", "reporte-enero.md"], ["Auditoría/Reportes", "reporte-febrero.txt"],
      ["Auditoría/Reportes", "reporte-marzo.md"], ["Auditoría/Reportes", "reporte-abril.txt"],
    ],
  },
];

const comparticionesSemilla: ComparticionSemilla[] = [
  { tipo: "carpeta", dueno: "uno", ruta: "Contratos", destino: "dos", permiso: "lectura" },
  { tipo: "carpeta", dueno: "uno", ruta: "Informes/2026", destino: "dos", permiso: "edicion" },
  { tipo: "archivo", dueno: "uno", ruta: "pendientes.md", destino: "dos", permiso: "comentar" },
  { tipo: "archivo", dueno: "uno", ruta: "Informes/2026/informe-q2-2026.txt", destino: "dos", permiso: "lectura" },
  { tipo: "archivo", dueno: "uno", ruta: "Informes/resumen-anual.md", destino: "dos", permiso: "lectura" },
  { tipo: "carpeta", dueno: "uno", ruta: "Contratos/Clientes", destino: "admin", permiso: "lectura" },
  { tipo: "archivo", dueno: "uno", ruta: "Contratos/contrato-marco.md", destino: "admin", permiso: "edicion" },
  { tipo: "archivo", dueno: "uno", ruta: "Informes/2025/informe-q1-2025.md", destino: "admin", permiso: "lectura" },
  { tipo: "carpeta", dueno: "dos", ruta: "Proyectos", destino: "uno", permiso: "lectura" },
  { tipo: "carpeta", dueno: "dos", ruta: "Proyectos/Alfa", destino: "uno", permiso: "edicion" },
  { tipo: "carpeta", dueno: "dos", ruta: "Reuniones", destino: "uno", permiso: "comentar" },
  { tipo: "archivo", dueno: "dos", ruta: "Reuniones/acta-semana-1.md", destino: "uno", permiso: "lectura" },
  { tipo: "archivo", dueno: "dos", ruta: "ideas.md", destino: "uno", permiso: "lectura" },
  { tipo: "archivo", dueno: "dos", ruta: "Proyectos/presupuesto.txt", destino: "uno", permiso: "lectura" },
  { tipo: "carpeta", dueno: "dos", ruta: "Reuniones", destino: "admin", permiso: "lectura" },
  { tipo: "archivo", dueno: "dos", ruta: "Proyectos/Beta/riesgos-beta.md", destino: "admin", permiso: "comentar" },
  { tipo: "carpeta", dueno: "admin", ruta: "Políticas", destino: "uno", permiso: "lectura" },
  { tipo: "archivo", dueno: "admin", ruta: "bienvenida.md", destino: "uno", permiso: "lectura" },
  { tipo: "carpeta", dueno: "admin", ruta: "Auditoría/Reportes", destino: "uno", permiso: "lectura" },
  { tipo: "carpeta", dueno: "admin", ruta: "Políticas", destino: "dos", permiso: "lectura" },
  { tipo: "archivo", dueno: "admin", ruta: "Auditoría/checklist.txt", destino: "dos", permiso: "edicion" },
  { tipo: "archivo", dueno: "admin", ruta: "Políticas/politica-uso.md", destino: "dos", permiso: "comentar" },
];

/** Días (hacia atrás desde hoy) en que cada usuario inició sesión. */
const diasLogin: Record<string, number[]> = {
  uno: [1, 2, 4, 5, 8, 9, 12, 15, 18, 22, 26, 30, 35, 40],
  dos: [1, 3, 6, 10, 14, 19, 24, 29, 33],
  admin: [2, 7, 13, 21, 28, 36],
};

// ---------- Acceso a datos y estado de la carga ----------

const usuarioDB = new UsuarioDB();
const carpetaDB = new CarpetaDB();
const archivoDB = new ArchivoDB();
const comparticionDB = new ComparticionDB();
const actividadDB = new ActividadDB();

const usuarioIds = new Map<string, ObjectId>();
const carpetaIds = new Map<string, ObjectId>();        // clave: "usuario|ruta"
const carpetaAncestros = new Map<string, ObjectId[]>(); // ancestros de cada carpeta
const archivoIds = new Map<string, ObjectId>();        // clave: "usuario|ruta/nombre"
const actividades: Actividad[] = [];

interface InfoArchivo {
  clave: string;
  id: ObjectId;
  nombre: string;
  dias: number;
}
const archivosInfo: InfoArchivo[] = [];

// ---------- Funciones auxiliares ----------

/** Fecha de hace "dias" días, a la hora indicada (los minutos varían según el día). */
function hace(dias: number, hora: number): Date {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  fecha.setHours(hora, (dias * 7) % 60, 0, 0);
  return fecha;
}

/** Busca un id en un mapa; si no existe, detiene la carga con un mensaje claro. */
function obtener(mapa: Map<string, ObjectId>, clave: string): ObjectId {
  const valor = mapa.get(clave);
  if (valor === undefined) {
    throw new Error("No existe en la carga inicial: " + clave);
  }
  return valor;
}

/** Último segmento de una ruta ("Contratos/Clientes" -> "Clientes"). */
function nombreDe(ruta: string): string {
  const partes = ruta.split("/");
  return partes[partes.length - 1];
}

/** Genera el contenido de prueba de un archivo, según su tipo. */
function crearContenido(nombre: string, tipo: "txt" | "md", numero: number): Buffer {
  const base = nombre.replace(/\.(txt|md)$/, "").replace(/-/g, " ");
  const titulo = base.charAt(0).toUpperCase() + base.slice(1);
  const secciones = 2 + (numero % 5);
  let texto = "";

  if (tipo === "md") {
    texto += "# " + titulo + "\n\n";
    for (let i = 1; i <= secciones; i++) {
      texto += "## Sección " + i + "\n\n";
      texto += "Documento de prueba del sistema de gestión documental sobre " + base + ".\n\n";
      texto += "- Punto uno de la sección " + i + "\n";
      texto += "- Punto dos de la sección " + i + "\n\n";
    }
  } else {
    texto += titulo.toUpperCase() + "\n" + "=".repeat(titulo.length) + "\n\n";
    for (let i = 1; i <= secciones; i++) {
      texto += i + ". Documento de prueba del sistema de gestión documental sobre " + base + ".\n";
      texto += "   Línea de detalle número " + i + " del archivo.\n\n";
    }
  }
  return Buffer.from(texto, "utf-8");
}

/** Prepara un registro de actividad con su fecha; se guardan todos al final, en orden cronológico. */
function anotar(
  usuario: ObjectId,
  accion: string,
  tipoRecurso: string | null,
  recursoId: ObjectId | null,
  nombreRecurso: string | null,
  detalle: string | null,
  fecha: Date
): void {
  const actividad = new Actividad(usuario, accion, tipoRecurso, recursoId, nombreRecurso, detalle);
  actividad.fecha = fecha;
  actividades.push(actividad);
}

/** Borra los datos de una carga anterior (carpetas, archivos, comparticiones, actividad y GridFS). */
async function limpiarDatos(): Promise<void> {
  const db = Conexion.obtener().db;
  await db.collection("carpetas").deleteMany({});
  await db.collection("archivos").deleteMany({});
  await db.collection("comparticiones").deleteMany({});
  await db.collection("actividad").deleteMany({});
  try {
    await new GridFSBucket(db, { bucketName: "contenidos" }).drop();
  } catch (error) {
    // El bucket aún no existía: no hay nada que borrar.
  }
}

/** Envía una carpeta y todo su contenido (subcarpetas y archivos) a la papelera. */
async function enviarCarpetaAPapelera(clave: string, ruta: string, dias: number): Promise<void> {
  const id = obtener(carpetaIds, clave + "|" + ruta);
  const fecha = hace(dias, 15);

  const ids: ObjectId[] = [id];
  const descendientes = await carpetaDB.buscarDescendientes(id);
  for (const d of descendientes) {
    ids.push(d._id!);
  }

  await carpetaDB.enviarAPapelera(id, fecha);
  await archivoDB.enviarPorCarpetas(ids, fecha);
  anotar(obtener(usuarioIds, clave), "ELIMINAR", "carpeta", id, nombreDe(ruta), "Enviada a la papelera", fecha);
}

/** Envía un archivo suelto a la papelera. */
async function enviarArchivoAPapelera(clave: string, ruta: string, dias: number): Promise<void> {
  const id = obtener(archivoIds, clave + "|" + ruta);
  const fecha = hace(dias, 16);

  await archivoDB.enviarAPapelera(id, fecha);
  anotar(obtener(usuarioIds, clave), "ELIMINAR", "archivo", id, nombreDe(ruta), "Enviado a la papelera", fecha);
}

// ---------- Carga ----------

await Conexion.obtener().conectar();

console.log("1/8 Creando índices...");
await usuarioDB.crearIndices();
await carpetaDB.crearIndices();
await archivoDB.crearIndices();
await comparticionDB.crearIndices();
await actividadDB.crearIndices();

console.log("2/8 Limpiando datos anteriores...");
await limpiarDatos();

console.log("3/8 Creando usuarios...");
const hash = await bcrypt.hash("123456", 10);
for (const u of usuariosSemilla) {
  const existente = await usuarioDB.buscarPorEmail(u.email);
  if (existente === null) {
    const id = await usuarioDB.crear(new Usuario(u.nombre, u.email, hash, u.rol));
    usuarioIds.set(u.clave, id);
    console.log("   Creado: " + u.email);
  } else {
    usuarioIds.set(u.clave, existente._id!);
    console.log("   Ya existía: " + u.email);
  }
}

console.log("4/8 Creando carpetas y archivos...");
let numeroArchivo = 0;
for (const plan of planes) {
  const ownerId = obtener(usuarioIds, plan.clave);

  // Carpetas
  for (const ruta of plan.carpetas) {
    const nombre = nombreDe(ruta);
    const partes = ruta.split("/");
    const rutaPadre = partes.slice(0, -1).join("/");

    let padreId: ObjectId | null = null;
    let ancestros: ObjectId[] = [];
    if (rutaPadre !== "") {
      padreId = obtener(carpetaIds, plan.clave + "|" + rutaPadre);
      ancestros = [...carpetaAncestros.get(plan.clave + "|" + rutaPadre)!, padreId];
    }

    const fecha = hace(50, 9);
    const carpeta = new Carpeta(nombre, ownerId, padreId, ancestros);
    carpeta.fechaCreacion = fecha;
    const id = await carpetaDB.crear(carpeta);

    carpetaIds.set(plan.clave + "|" + ruta, id);
    carpetaAncestros.set(plan.clave + "|" + ruta, ancestros);
    anotar(ownerId, "CREAR_CARPETA", "carpeta", id, nombre, null, fecha);
  }

  // Archivos
  for (const par of plan.archivos) {
    const rutaCarpeta = par[0];
    const nombre = par[1];
    const carpetaId = rutaCarpeta === "" ? null : obtener(carpetaIds, plan.clave + "|" + rutaCarpeta);

    const dias = 45 - Math.floor(numeroArchivo * 0.8);
    const fecha = hace(dias, 9 + (numeroArchivo % 9));
    const tipo: "txt" | "md" = nombre.endsWith(".md") ? "md" : "txt";
    const contenido = crearContenido(nombre, tipo, numeroArchivo);

    const gridfsId = await archivoDB.guardarContenido(nombre, contenido);
    const archivo = new Archivo(nombre, tipo, contenido.length, ownerId, carpetaId, gridfsId);
    archivo.fechaCreacion = fecha;
    archivo.fechaModificacion = fecha;
    const id = await archivoDB.crear(archivo);

    const rutaCompleta = rutaCarpeta === "" ? nombre : rutaCarpeta + "/" + nombre;
    archivoIds.set(plan.clave + "|" + rutaCompleta, id);
    archivosInfo.push({ clave: plan.clave, id: id, nombre: nombre, dias: dias });

    anotar(ownerId, "SUBIR_ARCHIVO", "archivo", id, nombre, null, fecha);
    if (numeroArchivo % 3 === 0) {
      anotar(ownerId, "DESCARGAR_ARCHIVO", "archivo", id, nombre, null, hace(Math.max(1, dias - 2), 16));
    }
    numeroArchivo++;
  }
}

console.log("5/8 Creando comparticiones...");
for (let i = 0; i < comparticionesSemilla.length; i++) {
  const c = comparticionesSemilla[i];
  const duenoId = obtener(usuarioIds, c.dueno);
  const destinoId = obtener(usuarioIds, c.destino);
  const recursoId = c.tipo === "carpeta"
    ? obtener(carpetaIds, c.dueno + "|" + c.ruta)
    : obtener(archivoIds, c.dueno + "|" + c.ruta);
  const nombre = nombreDe(c.ruta);
  const dias = 30 - i;
  const fecha = hace(dias, 10 + (i % 7));

  const comparticion = new Comparticion(c.tipo, recursoId, duenoId, destinoId, c.permiso);
  comparticion.fechaCreacion = fecha;
  await comparticionDB.crear(comparticion);

  const correoDestino = usuariosSemilla.find((u) => u.clave === c.destino)!.email;
  if (c.permiso === "edicion") {
    // Se compartió primero como lectura y luego se subió a edición.
    anotar(duenoId, "COMPARTIR", c.tipo, recursoId, nombre, "Con " + correoDestino + " (lectura)", fecha);
    anotar(duenoId, "CAMBIAR_PERMISO", c.tipo, recursoId, nombre, "Nuevo permiso: edicion", hace(Math.max(1, dias - 1), 12));
  } else {
    anotar(duenoId, "COMPARTIR", c.tipo, recursoId, nombre, "Con " + correoDestino + " (" + c.permiso + ")", fecha);
  }

  // Quien recibe un archivo lo descarga un par de veces.
  if (c.tipo === "archivo") {
    anotar(destinoId, "DESCARGAR_ARCHIVO", "archivo", recursoId, nombre, "Archivo compartido", hace(Math.max(1, dias - 2), 10));
    anotar(destinoId, "DESCARGAR_ARCHIVO", "archivo", recursoId, nombre, "Archivo compartido", hace(Math.max(1, dias - 5), 14));
  }
}

// Una compartición que se crea y luego se retira.
{
  const unoId = obtener(usuarioIds, "uno");
  const dosId = obtener(usuarioIds, "dos");
  const recursoId = obtener(archivoIds, "uno|Contratos/terminos-generales.txt");
  const extra = new Comparticion("archivo", recursoId, unoId, dosId, "lectura");
  extra.fechaCreacion = hace(28, 11);
  const idExtra = await comparticionDB.crear(extra);
  anotar(unoId, "COMPARTIR", "archivo", recursoId, "terminos-generales.txt", "Con dos@docs.com (lectura)", hace(28, 11));
  await comparticionDB.eliminar(idExtra);
  anotar(unoId, "RETIRAR_ACCESO", "archivo", recursoId, "terminos-generales.txt", null, hace(20, 11));
}

console.log("6/8 Enviando elementos a la papelera...");
await enviarCarpetaAPapelera("uno", "Borradores", 14);
await enviarArchivoAPapelera("uno", "viejo-memo.txt", 11);
await enviarCarpetaAPapelera("dos", "Pruebas", 13);
await enviarArchivoAPapelera("dos", "duplicado.md", 10);
await enviarArchivoAPapelera("admin", "obsoleto.txt", 9);

// Archivos que se eliminaron y se restauraron (quedan activos, con su historial).
{
  const unoId = obtener(usuarioIds, "uno");
  const dosId = obtener(usuarioIds, "dos");
  const idA = obtener(archivoIds, "uno|Informes/2026/informe-q3-2026.md");
  anotar(unoId, "ELIMINAR", "archivo", idA, "informe-q3-2026.md", "Enviado a la papelera", hace(16, 9));
  anotar(unoId, "RESTAURAR", "archivo", idA, "informe-q3-2026.md", null, hace(15, 9));
  const idB = obtener(archivoIds, "dos|Proyectos/Beta/cronograma-beta.txt");
  anotar(dosId, "ELIMINAR", "archivo", idB, "cronograma-beta.txt", "Enviado a la papelera", hace(18, 15));
  anotar(dosId, "RESTAURAR", "archivo", idB, "cronograma-beta.txt", null, hace(17, 10));
}

console.log("7/8 Aplicando un renombrado, un movimiento y una eliminación definitiva...");
{
  const unoId = obtener(usuarioIds, "uno");
  const dosId = obtener(usuarioIds, "dos");

  // Renombrado real.
  const idRenombrado = obtener(archivoIds, "uno|Informes/2025/informe-q3-2025.txt");
  await archivoDB.renombrar(idRenombrado, "informe-q3-2025-final.txt", "txt");
  anotar(unoId, "RENOMBRAR", "archivo", idRenombrado, "informe-q3-2025-final.txt", "Antes: informe-q3-2025.txt", hace(5, 11));

  // Movimiento real: ideas.md pasa de la raíz a la carpeta Proyectos.
  const idMovido = obtener(archivoIds, "dos|ideas.md");
  await archivoDB.mover(idMovido, obtener(carpetaIds, "dos|Proyectos"));
  anotar(dosId, "MOVER", "archivo", idMovido, "ideas.md", "De Mi unidad a Proyectos", hace(6, 12));

  // Eliminación definitiva real: el historial conserva el nombre aunque el archivo ya no exista.
  const contenidoTemp = Buffer.from("Archivo temporal de prueba.\n", "utf-8");
  const gridfsTemp = await archivoDB.guardarContenido("temporal.txt", contenidoTemp);
  const temporal = new Archivo("temporal.txt", "txt", contenidoTemp.length, dosId, null, gridfsTemp);
  temporal.fechaCreacion = hace(8, 9);
  const idTemporal = await archivoDB.crear(temporal);
  anotar(dosId, "SUBIR_ARCHIVO", "archivo", idTemporal, "temporal.txt", null, hace(8, 9));
  anotar(dosId, "ELIMINAR", "archivo", idTemporal, "temporal.txt", "Enviado a la papelera", hace(7, 10));
  anotar(dosId, "ELIMINAR_DEFINITIVO", "archivo", idTemporal, "temporal.txt", null, hace(6, 10));
  const guardado = await archivoDB.buscarPorId(idTemporal);
  await archivoDB.eliminarDefinitivo([guardado!]);
}

console.log("8/8 Guardando el historial de actividad...");
for (const clave of Object.keys(diasLogin)) {
  const id = obtener(usuarioIds, clave);
  const correo = usuariosSemilla.find((u) => u.clave === clave)!.email;
  for (const dias of diasLogin[clave]) {
    anotar(id, "LOGIN", "usuario", id, correo, null, hace(dias, 8 + (dias % 5)));
  }
}
actividades.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
for (const actividad of actividades) {
  await actividadDB.registrar(actividad);
}

// ---------- Resumen ----------

const db = Conexion.obtener().db;
console.log("\nCarga completa:");
console.log("  Usuarios:       " + (await db.collection("usuarios").countDocuments()));
console.log("  Carpetas:       " + (await db.collection("carpetas").countDocuments()) +
  " (activas: " + (await db.collection("carpetas").countDocuments({ eliminada: false })) + ")");
console.log("  Archivos:       " + (await db.collection("archivos").countDocuments()) +
  " (activos: " + (await db.collection("archivos").countDocuments({ eliminado: false })) + ")");
console.log("  Comparticiones: " + (await db.collection("comparticiones").countDocuments()));
console.log("  Actividad:      " + (await db.collection("actividad").countDocuments()));

process.exit(0);