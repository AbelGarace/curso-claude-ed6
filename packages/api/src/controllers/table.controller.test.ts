import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { TableController } from '@controllers/table.controller.js'
import { TableService } from '@services/table.service.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'

const TABLE_KEYS = ['capacity', 'createdAt', 'description', 'id', 'number', 'restaurantId', 'status', 'updatedAt']

const buildApp = (controller: TableController) => {
    const app = express()
    app.use(express.json())
    const tables = express.Router({ mergeParams: true })
    tables.get('/', controller.getAll)
    tables.get('/:id', controller.getById)
    tables.post('/', controller.create)
    tables.put('/:id', controller.update)
    tables.delete('/:id', controller.delete)
    tables.patch('/:id/status', controller.changeStatus)
    tables.post('/:id/occupy', controller.occupy)
    app.use('/restaurants/:restaurantId/tables', tables)
    const publicTables = express.Router({ mergeParams: true })
    publicTables.get('/', controller.getAvailable)
    app.use('/public/restaurants/:restaurantId/tables', publicTables)
    app.use(errorHandler)
    return app
}

describe('TableController', () => {
    let app: express.Express

    beforeEach(() => {
        app = buildApp(new TableController(new TableService(new MockTableRepository())))
    })

    const createTable = (body: object, restaurantId = 'r1') =>
        request(app).post(`/restaurants/${restaurantId}/tables`).send(body)

    it('POST should create a table with the restaurantId of the path and answer 201', async () => {
        const res = await createTable({ number: 1, description: 'Terraza', capacity: 4, restaurantId: 'otro' })

        expect(res.status).toBe(201)
        expect(Object.keys(res.body).sort()).toEqual(TABLE_KEYS)
        expect(res.body).toMatchObject({ number: 1, description: 'Terraza', capacity: 4, status: 'libre', restaurantId: 'r1' })
    })

    it('POST should answer 400 and 409 with Spanish messages', async () => {
        const invalid = await createTable({ number: '4', capacity: 4 })
        expect(invalid.status).toBe(400)
        expect(invalid.body).toEqual({ error: 'InvalidTableNumberError', message: 'El número de mesa debe ser un entero mayor que 0' })

        await createTable({ number: 1, capacity: 4 })
        const duplicated = await createTable({ number: 1, capacity: 2 })
        expect(duplicated.status).toBe(409)
        expect(duplicated.body.error).toBe('DuplicatedTableNumberError')
    })

    it('GET should list the tables and get one by id', async () => {
        const created = (await createTable({ number: 2, capacity: 4 })).body
        await createTable({ number: 1, capacity: 4 })

        const list = await request(app).get('/restaurants/r1/tables')
        expect(list.status).toBe(200)
        expect(list.body.map((t: { number: number }) => t.number)).toEqual([1, 2])

        const one = await request(app).get(`/restaurants/r1/tables/${created.id}`)
        expect(one.status).toBe(200)
        expect(one.body).toEqual(created)

        const otherRestaurant = await request(app).get(`/restaurants/r2/tables/${created.id}`)
        expect(otherRestaurant.status).toBe(404)
        expect(otherRestaurant.body).toEqual({ error: 'TableNotFoundError', message: 'Mesa no encontrada' })
    })

    it('PUT should replace the editable fields and keep the status if omitted', async () => {
        const created = (await createTable({ number: 1, description: 'Terraza', capacity: 4, status: 'reservada' })).body

        const res = await request(app).put(`/restaurants/r1/tables/${created.id}`).send({ number: 3, capacity: 6 })

        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ id: created.id, number: 3, description: null, capacity: 6, status: 'reservada' })
    })

    it('DELETE should answer 204, 409 if occupied and 404 if missing', async () => {
        const free = (await createTable({ number: 1, capacity: 4 })).body
        const occupied = (await createTable({ number: 2, capacity: 4, status: 'ocupada' })).body

        const deleted = await request(app).delete(`/restaurants/r1/tables/${free.id}`)
        expect(deleted.status).toBe(204)
        expect(deleted.text).toBe('')

        const conflict = await request(app).delete(`/restaurants/r1/tables/${occupied.id}`)
        expect(conflict.status).toBe(409)
        expect(conflict.body).toEqual({ error: 'TableOccupiedError', message: 'No se puede borrar una mesa ocupada' })

        expect((await request(app).delete(`/restaurants/r1/tables/${free.id}`)).status).toBe(404)
    })

    it('PATCH status should change the status', async () => {
        const created = (await createTable({ number: 1, capacity: 4, status: 'ocupada' })).body

        const res = await request(app).patch(`/restaurants/r1/tables/${created.id}/status`).send({ status: 'libre' })
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ id: created.id, status: 'libre' })

        const invalid = await request(app).patch(`/restaurants/r1/tables/${created.id}/status`).send({ status: 'rota' })
        expect(invalid.status).toBe(400)
        expect(invalid.body.error).toBe('InvalidTableStatusError')
    })

    it('POST occupy should occupy the table once', async () => {
        const created = (await createTable({ number: 1, capacity: 4 })).body

        const res = await request(app).post(`/restaurants/r1/tables/${created.id}/occupy`).send({ people: 4 })
        expect(res.status).toBe(200)
        expect(Object.keys(res.body).sort()).toEqual(TABLE_KEYS)
        expect(res.body.status).toBe('ocupada')

        const again = await request(app).post(`/restaurants/r1/tables/${created.id}/occupy`).send({ people: 4 })
        expect(again.status).toBe(409)
        expect(again.body.error).toBe('TableNotAvailableError')

        const invalid = await request(app).post(`/restaurants/r1/tables/${created.id}/occupy`).send({})
        expect(invalid.status).toBe(400)
        expect(invalid.body.error).toBe('InvalidPeopleError')
    })

    it('GET public should list available tables and validate people', async () => {
        await createTable({ number: 1, capacity: 2 })
        await createTable({ number: 2, capacity: 6 })
        await createTable({ number: 3, capacity: 4 })

        const res = await request(app).get('/public/restaurants/r1/tables?people=3')
        expect(res.status).toBe(200)
        expect(res.body.map((t: { number: number }) => t.number)).toEqual([3, 2])

        for (const query of ['', '?people=0', '?people=abc']) {
            const invalid = await request(app).get(`/public/restaurants/r1/tables${query}`)
            expect(invalid.status).toBe(400)
            expect(invalid.body.error).toBe('InvalidPeopleError')
        }
    })
})
