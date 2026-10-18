import { ObjectId } from "mongodb";

export type Rol = "ADMIN" | "USUARIO";

export default class Usuario {
    constructor(
        public nombre: string,
        public email: string,
        public passwordHash: string,
        public rol: Rol = "USUARIO",
        public activo: boolean = true,
        public fechaCreacion: Date = new Date(),
        public _id?: ObjectId
    ){}
}