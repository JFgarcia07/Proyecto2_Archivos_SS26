import { Router, Response, NextFunction } from "express";
import multer from "multer";
import ArchivoService from "../Services/ArchivoService.js";
import { autenticar, RequestAuth } from "../Middleware/AuthMiddleware.js";
import ErrorApp from "../Model/ErrorApp.js";

// multer recibe archivos subidos y los deja en memoria (máximo 5 MB).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * Endpoints REST de archivos (/api/archivos).
 * Solo recibe la petición HTTP, llama al Service y responde. Sin reglas de negocio.
 */
export default class ArchivoController {
    public router: Router = Router();
    private service: ArchivoService = new ArchivoService();

    constructor() {
        // Todas las rutas exigen token.
        this.router.use(autenticar);

        this.router.get("/", (req: RequestAuth, res: Response) => this.listar(req, res));
        this.router.post(
            "/",
            (req: RequestAuth, res: Response, next: NextFunction) => this.recibirArchivo(req, res, next),
            (req: RequestAuth, res: Response) => this.subir(req, res)
        );
        this.router.get("/:id/descargar", (req: RequestAuth, res: Response) => this.descargar(req, res));
        this.router.patch("/:id", (req: RequestAuth, res: Response) => this.renombrar(req, res));
        this.router.patch("/:id/mover", (req: RequestAuth, res: Response) => this.mover(req, res));
    }

    /** Devuelve el texto si es un string no vacío; si no, null. */
    private texto(valor: unknown): string | null {
        if (typeof valor === "string" && valor !== "") {
            return valor;
        }
        return null;
    }

    /** Convierte un error en respuesta HTTP: errores conocidos con su código, el resto 500. */
    private responderError(res: Response, error: unknown): void {
        if (error instanceof ErrorApp) {
            res.status(error.status).json({ error: error.message });
            return;
        }
        console.error(error);
        res.status(500).json({ error: "Error interno del servidor" });
    }

    /** Recibe el archivo del formulario (campo "archivo") antes de llegar a subir(). */
    private recibirArchivo(req: RequestAuth, res: Response, next: NextFunction): void {
        upload.single("archivo")(req, res, (error) => {
            if (error) {
                res.status(400).json({ error: "Archivo inválido o mayor a 5 MB" });
                return;
            }
            next();
        });
    }

    /** POST /api/archivos: sube un archivo. */
    private async subir(req: RequestAuth, res: Response): Promise<void> {
        try {
            if (!req.file) {
                throw new ErrorApp("Falta el archivo", 400);
            }
            // multer entrega el nombre en latin1; se reconvierte para conservar tildes y ñ.
            const nombre = Buffer.from(req.file.originalname, "latin1").toString("utf8");
            const idCarpeta = this.texto(req.body.carpetaId);

            const resultado = await this.service.subir(req.sesion!, nombre, req.file.buffer, idCarpeta);
            res.status(201).json(resultado);
        } catch (error) {
            this.responderError(res, error);
        }
    }

    /** GET /api/archivos?carpetaId=...&q=...&tipo=...: lista archivos. */
    private async listar(req: RequestAuth, res: Response): Promise<void> {
        try {
            const idCarpeta = this.texto(req.query.carpetaId);
            const buscar = this.texto(req.query.q);
            const tipo = this.texto(req.query.tipo);

            res.json(await this.service.listar(req.sesion!, idCarpeta, buscar, tipo));
        } catch (error) {
            this.responderError(res, error);
        }
    }

    /** GET /api/archivos/:id/descargar: descarga el contenido. */
    private async descargar(req: RequestAuth, res: Response): Promise<void> {
        try {
            const resultado = await this.service.descargar(req.sesion!, String(req.params.id));
            const archivo = resultado.archivo;
            const mime = archivo.tipo === "md" ? "text/markdown" : "text/plain";

            res.setHeader("Content-Type", mime + "; charset=utf-8");
            res.setHeader(
                "Content-Disposition",
                "attachment; filename*=UTF-8''" + encodeURIComponent(archivo.nombre)
            );
            resultado.flujo.pipe(res);
        } catch (error) {
            this.responderError(res, error);
        }
    }

    /** PATCH /api/archivos/:id: renombra. Body: { "nombre": "nuevo.txt" } */
    private async renombrar(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.renombrar(req.sesion!, String(req.params.id), req.body.nombre);
            res.json({ ok: true });
        } catch (error) {
            this.responderError(res, error);
        }
    }

    /** PATCH /api/archivos/:id/mover: mueve. Body: { "carpetaId": "..." } o null para la raíz. */
    private async mover(req: RequestAuth, res: Response): Promise<void> {
        try {
            const idCarpeta = this.texto(req.body.carpetaId);
            await this.service.mover(req.sesion!, String(req.params.id), idCarpeta);
            res.json({ ok: true });
        } catch (error) {
            this.responderError(res, error);
        }
    }
}