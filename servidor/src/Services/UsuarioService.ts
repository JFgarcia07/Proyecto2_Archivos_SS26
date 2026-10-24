import { ObjectId } from "mongodb";
import UsuarioDB from "../DB/UsuarioDB.js";
import ErrorApp from "../Model/ErrorApp.js";
import ActividadService from "./ActividadService.js";
import { Sesion } from "../Middleware/AuthMiddleware.js";

export default class UsuarioService {
    private usuarioDB: UsuarioDB = new UsuarioDB();
    private actividad: ActividadService = new ActividadService();

    async listar() {
        const lista = await this.usuarioDB.listarTodos();
        const resultado: any[] = [];
        for (let i = 0; i < lista.length; i++) {
            resultado.push({
                id: lista[i]._id,
                nombre: lista[i].nombre,
                email: lista[i].email,
                rol: lista[i].rol,
                activo: lista[i].activo,
                fechaCreacion: lista[i].fechaCreacion,
            });
        }
        return resultado;
    }

    /**
   * Activa o desactiva un usuario.
   * @throws ErrorApp 400 si el id es inválido o intenta desactivarse a sí mismo, 404 si no existe
   */
    async cambiarActivo(sesion: Sesion, idUsuario: string, activo: unknown): Promise<void> {
        if (typeof activo !== "boolean") {
            throw new ErrorApp("El campo 'activo' debe ser true o false", 400);
        }
        if (!ObjectId.isValid(idUsuario)) {
            throw new ErrorApp("Identificador inválido", 400);
        }
        if (idUsuario === sesion.id && !activo) {
            throw new ErrorApp("No puedes desactivar tu propia cuenta", 400);
        }

        const id = new ObjectId(idUsuario);
        const usuario = await this.usuarioDB.buscarPorId(id);
        if (usuario === null) {
            throw new ErrorApp("Usuario no encontrado", 404);
        }

        await this.usuarioDB.cambiarActivo(id, activo);
        await this.actividad.registrar(
            sesion.id, activo ? "ACTIVAR_USUARIO" : "DESACTIVAR_USUARIO", "usuario", id, usuario.email, null
        );
    }
}