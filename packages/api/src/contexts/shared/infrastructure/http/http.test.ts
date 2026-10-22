import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { authenticate, authorize } from '@shared/infrastructure/http/middlewares.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-resttek-key'

const buildApp = () => {
    const app = express()
    app.get('/privada', authenticate, authorize(['admin']), (_req, res) => {
        res.status(200).json({ ok: true })
    })
    app.get('/explota', () => {
        throw new Error('boom')
    })
    app.use(errorHandler)
    return app
}

describe('Mensajes HTTP en español', () => {
    it('responde 401 en español si no hay token', async () => {
        const res = await request(buildApp()).get('/privada')
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: 'No autorizado: no se ha proporcionado el token' })
    })

    it('responde 401 en español si el token está mal formado', async () => {
        const res = await request(buildApp()).get('/privada').set('Authorization', 'Bearer  xxx')
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: 'No autorizado: token mal formado' })
    })

    it('responde 401 en español si el token no es válido', async () => {
        const res = await request(buildApp()).get('/privada').set('Authorization', 'Bearer xxx')
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: 'No autorizado: token inválido' })
    })

    it('responde 403 en español si el rol no está permitido', async () => {
        const token = jwt.sign({ id: 'u1', role: 'cliente', restaurantId: null }, JWT_SECRET)
        const res = await request(buildApp()).get('/privada').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(403)
        expect(res.body).toEqual({ error: 'Acceso denegado: permisos insuficientes' })
    })

    it('responde 500 en español ante un error inesperado', async () => {
        const res = await request(buildApp()).get('/explota')
        expect(res.status).toBe(500)
        expect(res.body).toEqual({ error: 'InternalServerError', message: 'Se ha producido un error inesperado' })
    })
})
