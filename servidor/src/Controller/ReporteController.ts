import { Router, Response } from "express";
import ReporteService from "../Services/ReporteService.js";
import { autenticar, soloAdmin, RequestAuth } from "../Middleware/AuthMiddleware.js";
import ErrorApp from "../Model/ErrorApp.js";

/**
 * Endpoints REST de reportes (/api/reportes). Solo para administradores.
 * Solo recibe la petición HTTP, llama al Service y responde.
 */
export default class ReporteController {
    public router: Router = Router();
    private service: ReporteService = new ReporteService();

    constructor() {
        this.router.use(autenticar);
        this.router.use(soloAdmin);

        this.router.get("/usuarios", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.listarUsuarios()));

        this.router.get("/archivos-por-tipo", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.archivosPorTipo()));

        this.router.get("/archivos-por-fechas", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.archivosPorFechas(this.texto(req.query.desde), this.texto(req.query.hasta))));

        this.router.get("/archivos-mas-operaciones", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.archivosConMasOperaciones()));

        this.router.get("/usuarios-mas-archivos", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.usuariosConMasArchivos()));

        this.router.get("/usuarios-mas-compartidos", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.usuariosConMasCompartidos()));

        this.router.get("/archivos-mas-compartidos", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.archivosMasCompartidos()));

        this.router.get("/compartidos-por/:usuarioId", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.compartidosPor(String(req.params.usuarioId))));

        this.router.get("/recibidos-por/:usuarioId", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.recibidosPor(String(req.params.usuarioId))));

        this.router.get("/actividad-usuario/:usuarioId", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.actividadDeUsuario(
                req.sesion!, String(req.params.usuarioId), this.texto(req.query.desde), this.texto(req.query.hasta))));

        this.router.get("/operaciones-por-tipo", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.operacionesPorTipo(this.texto(req.query.desde), this.texto(req.query.hasta))));

        this.router.get("/operaciones-por-periodo", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.operacionesPorPeriodo(
                this.texto(req.query.periodo), this.texto(req.query.desde), this.texto(req.query.hasta))));

        this.router.get("/principales-acciones", (req: RequestAuth, res: Response) =>
            this.responder(res, () => this.service.principalesAcciones(this.texto(req.query.desde), this.texto(req.query.hasta))));
    }

    /** Devuelve el texto si es un string no vacío; si no, null. */
    private texto(valor: unknown): string | null {
        if (typeof valor === "string" && valor !== "") {
            return valor;
        }
        return null;
    }

    /** Ejecuta la consulta y responde con su resultado; los errores conocidos llevan su código HTTP. */
    private async responder(res: Response, tarea: () => Promise<unknown>): Promise<void> {
        try {
            res.json(await tarea());
        } catch (error) {
            if (error instanceof ErrorApp) {
                res.status(error.status).json({ error: error.message });
                return;
            }
            console.error(error);
            res.status(500).json({ error: "Error interno del servidor" });
        }
    }
}