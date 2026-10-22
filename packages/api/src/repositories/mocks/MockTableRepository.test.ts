import { describe, it, expect } from 'vitest'
import { MockTableRepository } from './MockTableRepository.js'
import type { Table } from '@models/table.model.js'

const buildTable = (overrides: Partial<Table> = {}): Table => ({
    id: 't1',
    number: 1,
    description: null,
    capacity: 4,
    status: 'libre',
    restaurantId: 'r1',
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides
})

describe('MockTableRepository', () => {
    it('should behave like the SQLite repository for listings', async () => {
        const repo = new MockTableRepository()
        await repo.save(buildTable({ id: 'a', number: 3, capacity: 4 }))
        await repo.save(buildTable({ id: 'b', number: 1, capacity: 6 }))
        await repo.save(buildTable({ id: 'c', number: 2, capacity: 4, status: 'ocupada' }))
        await repo.save(buildTable({ id: 'd', number: 4, capacity: 2 }))
        await repo.save(buildTable({ id: 'e', number: 1, restaurantId: 'r2' }))

        expect((await repo.findByRestaurantId('r1')).map(t => t.id)).toEqual(['b', 'c', 'a', 'd'])
        expect((await repo.findAvailable('r1', 3)).map(t => t.id)).toEqual(['a', 'b'])
        expect((await repo.findByNumber('r1', 2))?.id).toBe('c')
        expect(await repo.findByNumber('r1', 9)).toBeNull()
    })

    it('should update status, occupy only free tables and delete', async () => {
        const repo = new MockTableRepository()
        await repo.save(buildTable())

        expect(await repo.occupyIfFree('t1', 'y')).toBe(true)
        expect(await repo.occupyIfFree('t1', 'z')).toBe(false)
        expect(await repo.findById('t1')).toMatchObject({ status: 'ocupada', updatedAt: 'y' })

        await repo.updateStatus('t1', 'libre', 'w')
        expect(await repo.findById('t1')).toMatchObject({ status: 'libre', updatedAt: 'w' })

        await repo.delete('t1')
        expect(await repo.findById('t1')).toBeNull()
    })
})
