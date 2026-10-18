import { Router, Request, Response } from 'express';
import AuthService from '../Services/AuthService.js'

export default class AuthController {
    public router = Router();
    private service = new AuthService();

    constructor() {
        this.router.post("/login", this.login);
    }

    private login = async (req: Request, res: Response) => {
       try{
        const { email, password } = req.body;
        if(!email || !password){
            return res.status(400).json({error: "Email y contraseña son requeridos"});
        }
        res.json(await this.service.login(email, password));
       } catch (err: any){
            res.status(500).json({error: err.message});
       }
    }
}