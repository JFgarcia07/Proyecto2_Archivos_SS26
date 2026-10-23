import "dotenv/config";
import express from "express";
import cors from "cors";
import Conexion from "./DB/Conexion.js";
import AuthController from "./Controller/AuthController.js";
import CarpetaController from "./Controller/CarpetaController.js";
import ArchivoController from "./Controller/ArchivoController.js";
import PapeleraController from "./Controller/PapeleraController.js";
import ComparticionController from "./Controller/ComparticionController.js";
import ActividadController from "./Controller/ActividadController.js";

const app = express();

// Permite que Angular (localhost:4200) llame al servidor y que se lea JSON.
app.use(cors());
app.use(express.json());

// Ruta de prueba.
app.get("/api/ping", (req, res) => {
  res.json({ ok: true });
});

// Cada Controller expone sus rutas bajo un prefijo.
app.use("/api/auth", new AuthController().router);
app.use("/api/carpetas", new CarpetaController().router);
app.use("/api/archivos", new ArchivoController().router);
app.use("/api/papelera", new PapeleraController().router);
app.use("/api/comparticiones", new ComparticionController().router);
app.use("/api/actividad", new ActividadController().router);

// Primero se conecta a MongoDB y después se abre el puerto.
await Conexion.obtener().conectar();
app.listen(process.env.PORT, () => {
  console.log("Servidor en http://localhost:" + process.env.PORT);
});