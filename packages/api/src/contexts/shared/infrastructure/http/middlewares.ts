import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET: string = process.env.JWT_SECRET || 'super-secret-resttek-key'

export interface AuthRequest extends Request {
    user?: any
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado: no se ha proporcionado el token' })
        return
    }

    const tokenParts = authHeader.split(' ')
    const token = tokenParts[1]
    if (!token) {
        res.status(401).json({ error: 'No autorizado: token mal formado' })
        return
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET)
        req.user = decoded
        next()
    } catch {
        res.status(401).json({ error: 'No autorizado: token inválido' })
    }
}

export const authorize = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Acceso denegado: permisos insuficientes' })
            return
        }
        next()
    }
}
