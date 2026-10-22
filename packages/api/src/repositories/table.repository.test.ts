import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteTableRepository } from './table.repository.js'
import { Database } from '@config/database.js'
import type { Table } from '@models/table.model.js'

const NOW = '2026-10-22T09:00:00.000Z'

const buildTable = (overrides: Partial<Table> = {}): Table => ({
    id: 't1',
    number: 1,
    description: 'Terraza',
    capacity: 4,
    status: 'libre',
    restaurantId: 'r1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
})

describe('SqliteTableRepository (Integration)', () => {
    let db: Database
    let repo: SqliteTableRepository

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqliteTableRepository(db)

        for (const id of ['r1', 'r2']) {
            await db.run(
                'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', NOW, NOW]
            )
        }
    })

    afterEach(async () => {
        await db.close()
    })

    it('should save and find a table by id', async () => {
        await repo.save(buildTable())

        expect(await repo.findById('t1')).toEqual(buildTable())
    })

    it('should return null for a non-existent id', async () => {
        expect(await repo.findById('no-existe')).toBeNull()
    })

    it('should keep a null description', async () => {
        await repo.save(buildTable({ description: null }))

        expect((await repo.findById('t1'))?.description).toBeNull()
    })

    it('should update an existing table on save', async () => {
        await repo.save(buildTable())
        await repo.save(buildTable({ number: 7, description: null, capacity: 6, status: 'reservada', updatedAt: '2026-10-22T10:00:00.000Z' }))

        const found = await repo.findById('t1')
        expect(found).toEqual(buildTable({ number: 7, description: null, capacity: 6, status: 'reservada', updatedAt: '2026-10-22T10:00:00.000Z' }))
    })

    it('should list the tables of a restaurant ordered by number', async () => {
        await repo.save(buildTable({ id: 't3', number: 3 }))
        await repo.save(buildTable({ id: 't1', number: 1 }))
        await repo.save(buildTable({ id: 't2', number: 2 }))
        await repo.save(buildTable({ id: 'otro', number: 1, restaurantId: 'r2' }))

        const tables = await repo.findByRestaurantId('r1')
        expect(tables.map(t => t.id)).toEqual(['t1', 't2', 't3'])
    })

    it('should find a table by restaurant and number', async () => {
        await repo.save(buildTable())
        await repo.save(buildTable({ id: 'otro', restaurantId: 'r2' }))

        expect((await repo.findByNumber('r1', 1))?.id).toBe('t1')
        expect(await repo.findByNumber('r1', 2)).toBeNull()
    })

    it('should delete a table', async () => {
        await repo.save(buildTable())
        await repo.delete('t1')

        expect(await repo.findById('t1')).toBeNull()
    })

    it('should list only free tables with enough capacity ordered by capacity and number', async () => {
        await repo.save(buildTable({ id: 'grande', number: 1, capacity: 8 }))
        await repo.save(buildTable({ id: 'justa-5', number: 5, capacity: 4 }))
        await repo.save(buildTable({ id: 'justa-2', number: 2, capacity: 4 }))
        await repo.save(buildTable({ id: 'pequena', number: 3, capacity: 2 }))
        await repo.save(buildTable({ id: 'ocupada', number: 4, capacity: 6, status: 'ocupada' }))
        await repo.save(buildTable({ id: 'reservada', number: 6, capacity: 6, status: 'reservada' }))
        await repo.save(buildTable({ id: 'otro', number: 1, capacity: 4, restaurantId: 'r2' }))

        const tables = await repo.findAvailable('r1', 4)
        expect(tables.map(t => t.id)).toEqual(['justa-2', 'justa-5', 'grande'])
    })

    it('should update the status of a table', async () => {
        await repo.save(buildTable())
        await repo.updateStatus('t1', 'reservada', '2026-10-22T11:00:00.000Z')

        const found = await repo.findById('t1')
        expect(found?.status).toBe('reservada')
        expect(found?.updatedAt).toBe('2026-10-22T11:00:00.000Z')
    })

    it('should occupy a free table only once', async () => {
        await repo.save(buildTable())

        expect(await repo.occupyIfFree('t1', '2026-10-22T12:00:00.000Z')).toBe(true)
        expect(await repo.occupyIfFree('t1', '2026-10-22T12:01:00.000Z')).toBe(false)

        const found = await repo.findById('t1')
        expect(found?.status).toBe('ocupada')
        expect(found?.updatedAt).toBe('2026-10-22T12:00:00.000Z')
    })

    it('should not occupy a reserved table', async () => {
        await repo.save(buildTable({ status: 'reservada' }))

        expect(await repo.occupyIfFree('t1', NOW)).toBe(false)
        expect((await repo.findById('t1'))?.status).toBe('reservada')
    })

    it('should let only one of two concurrent occupations succeed', async () => {
        await repo.save(buildTable())

        const results = await Promise.all([repo.occupyIfFree('t1', NOW), repo.occupyIfFree('t1', NOW)])
        expect(results.filter(Boolean)).toHaveLength(1)
    })
})
