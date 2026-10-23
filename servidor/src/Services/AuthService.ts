import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import UsuarioDB from '../DB/UsuarioDB.js';
import ActividadService from "./ActividadService.js";

export default class AuthService {
    private usuarioDB = new UsuarioDB();
    private actividad: ActividadService = new ActividadService();

    async login(email: string, password: string) {
        const usuario = await this.usuarioDB.buscarPorEmail(email);
        if(!usuario || !usuario.activo || !(await bcrypt.compare(password, usuario.passwordHash))) {
            throw new Error("Credenciales inválidas");
        }
        await this.actividad.registrar(usuario._id!.toString(), "LOGIN", "usuario", usuario._id!, usuario.email, null);
        const token = jwt.sign(
            {id: usuario._id!.toString(), rol: usuario.rol},
            process.env.JWT_SECRET as string,
            { expiresIn: '1h'}
        );
        return {
            token,
            usuario:{
                usuario: {id: usuario._id!.toString(), nombre: usuario.nombre, email: usuario.email, rol: usuario.rol}
            }
        }
    }
}