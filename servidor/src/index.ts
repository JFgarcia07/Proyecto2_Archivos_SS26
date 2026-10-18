import "dotenv/config";
import express from "express";
import cors from "cors";
import Conexion from "./DB/Conexion.js";
import AuthController from "./Controller/AuthController.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", new AuthController().router);

app.get("/api/ping", (req, res) => res.json({ ok: true }));

await Conexion.obtener().conectar();
app.listen(process.env.PORT, () =>
  console.log(`Servidor en http://localhost:${process.env.PORT}`)
);