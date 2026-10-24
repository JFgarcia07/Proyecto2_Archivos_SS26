import { Router, Response } from "express";
import UsuarioService from "../Services/UsuarioService.js";
import { autenticar, soloAdmin, RequestAuth } from "../Middleware/AuthMiddleware.js";
import ErrorApp from "../Model/ErrorApp.js";

export default class UsuarioController {
  public router: Router = Router();
  private service: UsuarioService = new UsuarioService();

  constructor() {
    this.router.use(autenticar);
    this.router.use(soloAdmin);

    this.router.get("/", (req: RequestAuth, res: Response) => this.listar(req, res));
    this.router.patch("/:id/activo", (req: RequestAuth, res: Response) => this.cambiarActivo(req, res));
  }

  private responderError(res: Response, error: unknown): void {
    if (error instanceof ErrorApp) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }

  /** GET /api/usuarios: lista los usuarios. */
  private async listar(req: RequestAuth, res: Response): Promise<void> {
    try {
      res.json(await this.service.listar());
    } catch (error) { this.responderError(res, error); }
  }

  /** PATCH /api/usuarios/:id/activo. Body: { "activo": true | false } */
  private async cambiarActivo(req: RequestAuth, res: Response): Promise<void> {
    try {
      await this.service.cambiarActivo(req.sesion!, String(req.params.id), req.body.activo);
      res.json({ ok: true });
    } catch (error) { this.responderError(res, error); }
  }
}