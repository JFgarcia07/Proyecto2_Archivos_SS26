import { Router, Response } from "express";
import CarpetaService from "../Services/CarpetaService.js";
import { autenticar, RequestAuth } from "../Middleware/AuthMiddleware.js";
import ErrorApp from "../Model/ErrorApp.js";

/**
 * Endpoints REST de carpetas (/api/carpetas).
 * Solo recibe la petición HTTP, llama al Service y responde. Sin reglas de negocio.
*/
export default class CarpetaController {
    public router: Router = Router();
    private service: CarpetaService = new CarpetaService();

    constructor() {
        // Todas las rutas exigen token.
        this.router.use(autenticar);

        this.router.get("/", (req: RequestAuth, res: Response) => this.listar(req, res));
        this.router.post("/", (req: RequestAuth, res: Response) => this.crear(req, res));
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

    /** GET /api/carpetas?parentId=...: lista subcarpetas (sin parentId = raíz). */
    private async listar(req: RequestAuth, res: Response): Promise<void> {
        try {
        const idPadre = this.texto(req.query.parentId);
        res.json(await this.service.listar(req.sesion!, idPadre));
        } catch (error) {
        this.responderError(res, error);
        }
    }

    /** POST /api/carpetas: crea. Body: { "nombre": "...", "parentId": "..." | null } */
    private async crear(req: RequestAuth, res: Response): Promise<void> {
        try {
        const idPadre = this.texto(req.body.parentId);
        const resultado = await this.service.crear(req.sesion!, req.body.nombre, idPadre);
        res.status(201).json(resultado);
        } catch (error) {
        this.responderError(res, error);
        }
    }

    /** PATCH /api/carpetas/:id: renombra. Body: { "nombre": "..." } */
    private async renombrar(req: RequestAuth, res: Response): Promise<void> {
        try {
        await this.service.renombrar(req.sesion!, String(req.params.id), req.body.nombre);
        res.json({ ok: true });
        } catch (error) {
        this.responderError(res, error);
        }
    }

    /** PATCH /api/carpetas/:id/mover: mueve. Body: { "parentId": "..." | null } */
    private async mover(req: RequestAuth, res: Response): Promise<void> {
        try {
        const idDestino = this.texto(req.body.parentId);
        await this.service.mover(req.sesion!, String(req.params.id), idDestino);
        res.json({ ok: true });
        } catch (error) {
        this.responderError(res, error);
        }
    }
}