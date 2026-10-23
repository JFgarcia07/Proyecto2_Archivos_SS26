import { Router, Response } from "express";
import PapeleraService from "../Services/PapeleraService.js";
import { autenticar, RequestAuth } from "../Middleware/AuthMiddleware.js";
import ErrorApp from "../Model/ErrorApp.js";

/**
 * Endpoints REST de la papelera (/api/papelera).
 * Solo recibe la petición HTTP, llama al Service y responde.
 */
export default class PapeleraController {
    public router: Router = Router();
    private service: PapeleraService = new PapeleraService();

    constructor() {
        this.router.use(autenticar);

        this.router.get("/", (req: RequestAuth, res: Response) => this.listar(req, res));
        this.router.post("/carpetas/:id", (req: RequestAuth, res: Response) => this.enviarCarpeta(req, res));
        this.router.post("/archivos/:id", (req: RequestAuth, res: Response) => this.enviarArchivo(req, res));
        this.router.post("/carpetas/:id/restaurar", (req: RequestAuth, res: Response) => this.restaurarCarpeta(req, res));
        this.router.post("/archivos/:id/restaurar", (req: RequestAuth, res: Response) => this.restaurarArchivo(req, res));
        this.router.delete("/carpetas/:id", (req: RequestAuth, res: Response) => this.eliminarCarpeta(req, res));
        this.router.delete("/archivos/:id", (req: RequestAuth, res: Response) => this.eliminarArchivo(req, res));
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

    /** GET /api/papelera: lista carpetas y archivos eliminados. */
    private async listar(req: RequestAuth, res: Response): Promise<void> {
        try {
            res.json(await this.service.listar(req.sesion!));
        } catch (error) { this.responderError(res, error); }
    }

    /** POST /api/papelera/carpetas/:id: envía una carpeta a la papelera. */
    private async enviarCarpeta(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.enviarCarpeta(req.sesion!, String(req.params.id));
            res.json({ ok: true });
        } catch (error) { this.responderError(res, error); }
    }

    /** POST /api/papelera/archivos/:id: envía un archivo a la papelera. */
    private async enviarArchivo(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.enviarArchivo(req.sesion!, String(req.params.id));
            res.json({ ok: true });
        } catch (error) { this.responderError(res, error); }
    }

    /** POST /api/papelera/carpetas/:id/restaurar */
    private async restaurarCarpeta(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.restaurarCarpeta(req.sesion!, String(req.params.id));
            res.json({ ok: true });
        } catch (error) { this.responderError(res, error); }
    }

    /** POST /api/papelera/archivos/:id/restaurar */
    private async restaurarArchivo(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.restaurarArchivo(req.sesion!, String(req.params.id));
            res.json({ ok: true });
        } catch (error) { this.responderError(res, error); }
    }

    /** DELETE /api/papelera/carpetas/:id: eliminación definitiva. */
    private async eliminarCarpeta(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.eliminarCarpetaDefinitivo(req.sesion!, String(req.params.id));
            res.json({ ok: true });
        } catch (error) { this.responderError(res, error); }
    }

    /** DELETE /api/papelera/archivos/:id: eliminación definitiva. */
    private async eliminarArchivo(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.eliminarArchivoDefinitivo(req.sesion!, String(req.params.id));
            res.json({ ok: true });
        } catch (error) { this.responderError(res, error); }
    }
}