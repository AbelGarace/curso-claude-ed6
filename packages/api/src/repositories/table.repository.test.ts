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
})
