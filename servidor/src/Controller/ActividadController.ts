import { Router, Response } from "express";
import ActividadService from "../Services/ActividadService.js";
import { autenticar, RequestAuth } from "../Middleware/AuthMiddleware.js";
import ErrorApp from "../Model/ErrorApp.js";

/**
 * Endpoints REST del historial (/api/actividad).
 * Solo recibe la petición HTTP, llama al Service y responde.
 */
export default class ActividadController {
    public router: Router = Router();
    private service: ActividadService = new ActividadService();

    constructor() {
        this.router.use(autenticar);
        this.router.get("/", (req: RequestAuth, res: Response) => this.listar(req, res));
        this.router.get("/recurso/:id", (req: RequestAuth, res: Response) => this.deRecurso(req, res));
    }

    private texto(valor: unknown): string | null {
        if (typeof valor === "string" && valor !== "") {
            return valor;
        }
        return null;
    }

    private responderError(res: Response, error: unknown): void {
        if (error instanceof ErrorApp) {
            res.status(error.status).json({ error: error.message });
            return;
        }
        console.error(error);
        res.status(500).json({ error: "Error interno del servidor" });
    }

    /** GET /api/actividad?usuarioId=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD&accion= */
    private async listar(req: RequestAuth, res: Response): Promise<void> {
        try {
            const q = req.query;
            res.json(await this.service.listar(
                req.sesion!, this.texto(q.usuarioId), this.texto(q.desde), this.texto(q.hasta), this.texto(q.accion)
            ));
        } catch (error) { this.responderError(res, error); }
    }

    /** GET /api/actividad/recurso/:id: historial de un archivo o carpeta. */
    private async deRecurso(req: RequestAuth, res: Response): Promise<void> {
        try {
            res.json(await this.service.listarDeRecurso(req.sesion!, String(req.params.id)));
        } catch (error) { this.responderError(res, error); }
    }
}