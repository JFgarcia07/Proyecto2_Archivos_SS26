import { Router, Response } from "express";
import ComparticionService from "../Services/ComparticionService.js";
import { autenticar, RequestAuth } from "../Middleware/AuthMiddleware.js";
import ErrorApp from "../Model/ErrorApp.js";

/**
 * Endpoints REST de compartición (/api/comparticiones).
 * Solo recibe la petición HTTP, llama al Service y responde.
 */
export default class ComparticionController {
    public router: Router = Router();
    private service: ComparticionService = new ComparticionService();

    constructor() {
        this.router.use(autenticar);

        this.router.post("/", (req: RequestAuth, res: Response) => this.compartir(req, res));
        this.router.get("/enviadas", (req: RequestAuth, res: Response) => this.enviadas(req, res));
        this.router.get("/recibidas", (req: RequestAuth, res: Response) => this.recibidas(req, res));
        this.router.patch("/:id", (req: RequestAuth, res: Response) => this.cambiarPermiso(req, res));
        this.router.delete("/:id", (req: RequestAuth, res: Response) => this.retirar(req, res));
        this.router.get("/carpetas/:id/contenido", (req: RequestAuth, res: Response) => this.contenido(req, res));
        this.router.get("/archivos/:id/descargar", (req: RequestAuth, res: Response) => this.descargar(req, res));
        this.router.patch("/archivos/:id", (req: RequestAuth, res: Response) => this.renombrar(req, res));
    }

    private responderError(res: Response, error: unknown): void {
        if (error instanceof ErrorApp) {
            res.status(error.status).json({ error: error.message });
            return;
        }
        console.error(error);
        res.status(500).json({ error: "Error interno del servidor" });
    }

    /** POST /api/comparticiones. Body: { tipoRecurso, recursoId, email, permiso } */
    private async compartir(req: RequestAuth, res: Response): Promise<void> {
        try {
            const b = req.body;
            const resultado = await this.service.compartir(req.sesion!, b.tipoRecurso, String(b.recursoId), b.email, b.permiso);
            res.status(201).json(resultado);
        } catch (error) { this.responderError(res, error); }
    }

    /** GET /api/comparticiones/enviadas */
    private async enviadas(req: RequestAuth, res: Response): Promise<void> {
        try {
            res.json(await this.service.listarEnviadas(req.sesion!));
        } catch (error) { this.responderError(res, error); }
    }

    /** GET /api/comparticiones/recibidas */
    private async recibidas(req: RequestAuth, res: Response): Promise<void> {
        try {
            res.json(await this.service.listarRecibidas(req.sesion!));
        } catch (error) { this.responderError(res, error); }
    }

    /** PATCH /api/comparticiones/:id. Body: { permiso } */
    private async cambiarPermiso(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.cambiarPermiso(req.sesion!, String(req.params.id), req.body.permiso);
            res.json({ ok: true });
        } catch (error) { this.responderError(res, error); }
    }

    /** DELETE /api/comparticiones/:id: retira el acceso. */
    private async retirar(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.retirar(req.sesion!, String(req.params.id));
            res.json({ ok: true });
        } catch (error) { this.responderError(res, error); }
    }

    /** GET /api/comparticiones/carpetas/:id/contenido */
    private async contenido(req: RequestAuth, res: Response): Promise<void> {
        try {
            res.json(await this.service.contenidoCarpeta(req.sesion!, String(req.params.id)));
        } catch (error) { this.responderError(res, error); }
    }

    /** GET /api/comparticiones/archivos/:id/descargar */
    private async descargar(req: RequestAuth, res: Response): Promise<void> {
        try {
            const resultado = await this.service.descargar(req.sesion!, String(req.params.id));
            const archivo = resultado.archivo;
            const mime = archivo.tipo === "md" ? "text/markdown" : "text/plain";
            res.setHeader("Content-Type", mime + "; charset=utf-8");
            res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(archivo.nombre));
            resultado.flujo.pipe(res);
        } catch (error) { this.responderError(res, error); }
    }

    /** PATCH /api/comparticiones/archivos/:id. Body: { nombre } (requiere permiso de edición). */
    private async renombrar(req: RequestAuth, res: Response): Promise<void> {
        try {
            await this.service.renombrarArchivo(req.sesion!, String(req.params.id), req.body.nombre);
            res.json({ ok: true });
        } catch (error) { this.responderError(res, error); }
    }
}