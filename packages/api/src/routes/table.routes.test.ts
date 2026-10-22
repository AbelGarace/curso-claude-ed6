import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../app.js'
import { dbConfig } from '@config/database.js'

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-resttek-key'
const tokenFor = (role: string) => `Bearer ${jwt.sign({ id: `${role}-1`, role, restaurantId: role === 'admin' || role === 'cliente' ? null : 'r1' }, JWT_SECRET)}`
const BASE = '/api/v1/restaurants/r1/tables'

describe('Rutas de mesas (app completa)', () => {
    beforeAll(async () => {
        process.env.NODE_ENV = 'test'
        await dbConfig.initialize()
        const now = new Date().toISOString()
        await dbConfig.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['r1', 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', now, now]
        )
    })

    afterAll(async () => {
        await dbConfig.close()
    })

    const createTable = (number: number, capacity = 4) =>
        request(app).post(BASE).set('Authorization', tokenFor('admin')).send({ number, capacity })

    it('should require authentication on private routes', async () => {
        const res = await request(app).get(BASE)
        expect(res.status).toBe(401)
    })

    it('should let only admin create, update and delete', async () => {
        const created = await createTable(1)
        expect(created.status).toBe(201)

        for (const role of ['manager', 'camarero', 'cocinero', 'cliente']) {
            expect((await request(app).post(BASE).set('Authorization', tokenFor(role)).send({ number: 99, capacity: 2 })).status).toBe(403)
            expect((await request(app).put(`${BASE}/${created.body.id}`).set('Authorization', tokenFor(role)).send({ number: 1, capacity: 2 })).status).toBe(403)
            expect((await request(app).delete(`${BASE}/${created.body.id}`).set('Authorization', tokenFor(role))).status).toBe(403)
        }

        expect((await request(app).put(`${BASE}/${created.body.id}`).set('Authorization', tokenFor('admin')).send({ number: 1, capacity: 6 })).status).toBe(200)
        expect((await request(app).delete(`${BASE}/${created.body.id}`).set('Authorization', tokenFor('admin'))).status).toBe(204)
    })

    it('should let staff read tables but not clients', async () => {
        const created = await createTable(2)

        for (const role of ['admin', 'manager', 'camarero', 'cocinero']) {
            expect((await request(app).get(BASE).set('Authorization', tokenFor(role))).status).toBe(200)
            expect((await request(app).get(`${BASE}/${created.body.id}`).set('Authorization', tokenFor(role))).status).toBe(200)
        }
        expect((await request(app).get(BASE).set('Authorization', tokenFor('cliente'))).status).toBe(403)
    })

    it('should let only manager and camarero change the status', async () => {
        const created = await createTable(3)
        const patch = (role: string) => request(app)
            .patch(`${BASE}/${created.body.id}/status`).set('Authorization', tokenFor(role)).send({ status: 'reservada' })

        for (const role of ['admin', 'cocinero', 'cliente']) {
            expect((await patch(role)).status).toBe(403)
        }
        expect((await patch('manager')).status).toBe(200)
        expect((await patch('camarero')).status).toBe(200)
    })

    it('should let only clients occupy a table, once', async () => {
        const created = await createTable(4)
        const occupy = (role: string) => request(app)
            .post(`${BASE}/${created.body.id}/occupy`).set('Authorization', tokenFor(role)).send({ people: 2 })

        for (const role of ['admin', 'manager', 'camarero', 'cocinero']) {
            expect((await occupy(role)).status).toBe(403)
        }
        const first = await occupy('cliente')
        expect(first.status).toBe(200)
        expect(first.body.status).toBe('ocupada')
        expect((await occupy('cliente')).status).toBe(409)
    })

    it('should expose available tables publicly', async () => {
        await createTable(10, 8)

        const res = await request(app).get('/api/v1/public/restaurants/r1/tables?people=7')
        expect(res.status).toBe(200)
        expect(res.body.map((t: { number: number }) => t.number)).toEqual([10])

        expect((await request(app).get('/api/v1/public/restaurants/r1/tables?people=0')).status).toBe(400)
    })
})
