import { describe, it, expect, beforeEach } from 'vitest'
import { TableService } from './table.service.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import {
    DuplicatedTableNumberError,
    InvalidCapacityError,
    InvalidPeopleError,
    InvalidTableNumberError,
    InvalidTableStatusError,
    RestaurantIdRequiredError,
    TableNotAvailableError,
    TableNotFoundError,
    TableOccupiedError
} from '@errors/DomainErrors.js'

describe('TableService', () => {
    let repo: MockTableRepository
    let service: TableService

    beforeEach(() => {
        repo = new MockTableRepository()
        service = new TableService(repo)
    })

    describe('create', () => {
        it('should create a free table by default', async () => {
            const table = await service.create({ number: 1, description: 'Terraza', capacity: 4, restaurantId: 'r1' })

            expect(table).toMatchObject({ number: 1, description: 'Terraza', capacity: 4, status: 'libre', restaurantId: 'r1' })
            expect(table.id).toBeTruthy()
            expect(table.createdAt).toBe(table.updatedAt)
            expect(await repo.findById(table.id)).toEqual(table)
        })

        it('should accept and normalize a given status', async () => {
            const table = await service.create({ number: 1, capacity: 4, status: ' Reservada ', restaurantId: 'r1' })
            expect(table.status).toBe('reservada')
        })

        it('should store a missing or blank description as null and trim it', async () => {
            expect((await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })).description).toBeNull()
            expect((await service.create({ number: 2, description: '   ', capacity: 4, restaurantId: 'r1' })).description).toBeNull()
            expect((await service.create({ number: 3, description: ' Barra ', capacity: 4, restaurantId: 'r1' })).description).toBe('Barra')
        })

        it.each([0, -1, 2.5, '4', null, undefined])('should reject the number %s', async (number) => {
            await expect(service.create({ number, capacity: 4, restaurantId: 'r1' }))
                .rejects.toThrow(InvalidTableNumberError)
        })

        it.each([0, -3, 1.5, '4', null, undefined])('should reject the capacity %s', async (capacity) => {
            await expect(service.create({ number: 1, capacity, restaurantId: 'r1' }))
                .rejects.toThrow(InvalidCapacityError)
        })

        it('should reject an invalid status', async () => {
            await expect(service.create({ number: 1, capacity: 4, status: 'rota', restaurantId: 'r1' }))
                .rejects.toThrow(InvalidTableStatusError)
        })

        it('should reject an empty restaurantId', async () => {
            await expect(service.create({ number: 1, capacity: 4, restaurantId: '' }))
                .rejects.toThrow(RestaurantIdRequiredError)
        })

        it('should reject a repeated number in the same restaurant', async () => {
            await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.create({ number: 1, capacity: 2, restaurantId: 'r1' }))
                .rejects.toThrow(DuplicatedTableNumberError)
        })

        it('should allow the same number in another restaurant', async () => {
            await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.create({ number: 1, capacity: 4, restaurantId: 'r2' })).resolves.toBeTruthy()
        })
    })

    describe('update', () => {
        it('should replace number, description and capacity and keep the status if omitted', async () => {
            const created = await service.create({ number: 1, description: 'Terraza', capacity: 4, status: 'ocupada', restaurantId: 'r1' })

            const updated = await service.update('r1', created.id, { number: 2, capacity: 6 })

            expect(updated).toMatchObject({ id: created.id, number: 2, description: null, capacity: 6, status: 'ocupada', restaurantId: 'r1', createdAt: created.createdAt })
            expect(await repo.findById(created.id)).toEqual(updated)
        })

        it('should change the status if given', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            const updated = await service.update('r1', created.id, { number: 1, capacity: 4, status: 'reservada' })
            expect(updated.status).toBe('reservada')
        })

        it('should allow keeping its own number', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.update('r1', created.id, { number: 1, capacity: 8 })).resolves.toMatchObject({ capacity: 8 })
        })

        it('should reject the number of another table of the restaurant', async () => {
            await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })
            const other = await service.create({ number: 2, capacity: 4, restaurantId: 'r1' })

            await expect(service.update('r1', other.id, { number: 1, capacity: 4 }))
                .rejects.toThrow(DuplicatedTableNumberError)
        })

        it('should validate the new values', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.update('r1', created.id, { capacity: 4 })).rejects.toThrow(InvalidTableNumberError)
            await expect(service.update('r1', created.id, { number: 1, capacity: 0 })).rejects.toThrow(InvalidCapacityError)
            await expect(service.update('r1', created.id, { number: 1, capacity: 4, status: 'rota' })).rejects.toThrow(InvalidTableStatusError)
        })

        it('should throw TableNotFoundError for a non-existent table or one of another restaurant', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.update('r1', 'no-existe', { number: 1, capacity: 4 })).rejects.toThrow(TableNotFoundError)
            await expect(service.update('r2', created.id, { number: 1, capacity: 4 })).rejects.toThrow(TableNotFoundError)
        })
    })

    describe('delete', () => {
        it.each(['libre', 'reservada'])('should delete a %s table', async (status) => {
            const created = await service.create({ number: 1, capacity: 4, status, restaurantId: 'r1' })

            await service.delete('r1', created.id)
            expect(await repo.findById(created.id)).toBeNull()
        })

        it('should not delete an occupied table', async () => {
            const created = await service.create({ number: 1, capacity: 4, status: 'ocupada', restaurantId: 'r1' })

            await expect(service.delete('r1', created.id)).rejects.toThrow(TableOccupiedError)
            expect(await repo.findById(created.id)).not.toBeNull()
        })

        it('should throw TableNotFoundError for a non-existent table or one of another restaurant', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.delete('r1', 'no-existe')).rejects.toThrow(TableNotFoundError)
            await expect(service.delete('r2', created.id)).rejects.toThrow(TableNotFoundError)
            expect(await repo.findById(created.id)).not.toBeNull()
        })
    })

    describe('findById / findByRestaurantId', () => {
        it('should return a table of the restaurant', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            expect(await service.findById('r1', created.id)).toEqual(created)
        })

        it('should throw TableNotFoundError for a non-existent table or one of another restaurant', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.findById('r1', 'no-existe')).rejects.toThrow(TableNotFoundError)
            await expect(service.findById('r2', created.id)).rejects.toThrow(TableNotFoundError)
        })

        it('should list the tables of a restaurant ordered by number', async () => {
            await service.create({ number: 2, capacity: 4, restaurantId: 'r1' })
            await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })
            await service.create({ number: 1, capacity: 4, restaurantId: 'r2' })

            const tables = await service.findByRestaurantId('r1')
            expect(tables.map(t => t.number)).toEqual([1, 2])
        })
    })

    describe('listAvailable', () => {
        beforeEach(async () => {
            await service.create({ number: 1, capacity: 8, restaurantId: 'r1' })
            await service.create({ number: 5, capacity: 4, restaurantId: 'r1' })
            await service.create({ number: 2, capacity: 4, restaurantId: 'r1' })
            await service.create({ number: 3, capacity: 2, restaurantId: 'r1' })
            await service.create({ number: 4, capacity: 6, status: 'ocupada', restaurantId: 'r1' })
            await service.create({ number: 6, capacity: 6, status: 'reservada', restaurantId: 'r1' })
        })

        it('should list free tables with enough capacity ordered by capacity and number', async () => {
            const tables = await service.listAvailable('r1', 4)
            expect(tables.map(t => t.number)).toEqual([2, 5, 1])
        })

        it('should accept people as a string of digits (query param)', async () => {
            const tables = await service.listAvailable('r1', '7')
            expect(tables.map(t => t.number)).toEqual([1])
        })

        it('should return an empty list for an unknown restaurant', async () => {
            expect(await service.listAvailable('no-existe', 2)).toEqual([])
        })

        it.each([0, -1, 2.5, '0', '-1', '2.5', 'abc', '', undefined, null])('should reject people = %s', async (people) => {
            await expect(service.listAvailable('r1', people)).rejects.toThrow(InvalidPeopleError)
        })
    })

    describe('changeStatus', () => {
        it('should change and normalize the status', async () => {
            const created = await service.create({ number: 1, capacity: 4, status: 'ocupada', restaurantId: 'r1' })

            const updated = await service.changeStatus('r1', created.id, ' LIBRE ')

            expect(updated).toMatchObject({ id: created.id, status: 'libre' })
            expect((await repo.findById(created.id))?.status).toBe('libre')
        })

        it('should allow setting the same status', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.changeStatus('r1', created.id, 'libre')).resolves.toMatchObject({ status: 'libre' })
        })

        it('should reject an invalid or missing status', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.changeStatus('r1', created.id, 'rota')).rejects.toThrow(InvalidTableStatusError)
            await expect(service.changeStatus('r1', created.id, undefined)).rejects.toThrow(InvalidTableStatusError)
        })

        it('should throw TableNotFoundError for a non-existent table or one of another restaurant', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.changeStatus('r1', 'no-existe', 'libre')).rejects.toThrow(TableNotFoundError)
            await expect(service.changeStatus('r2', created.id, 'libre')).rejects.toThrow(TableNotFoundError)
        })
    })

    describe('occupy', () => {
        it('should occupy a free table with enough capacity', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            const occupied = await service.occupy('r1', created.id, 4)

            expect(occupied).toMatchObject({ id: created.id, status: 'ocupada' })
            expect((await repo.findById(created.id))?.status).toBe('ocupada')
        })

        it('should not occupy the same table twice', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })
            await service.occupy('r1', created.id, 2)

            await expect(service.occupy('r1', created.id, 2)).rejects.toThrow(TableNotAvailableError)
        })

        it('should not occupy a reserved table', async () => {
            const created = await service.create({ number: 1, capacity: 4, status: 'reservada', restaurantId: 'r1' })

            await expect(service.occupy('r1', created.id, 2)).rejects.toThrow(TableNotAvailableError)
        })

        it('should not occupy a table with less capacity than people', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.occupy('r1', created.id, 5)).rejects.toThrow(TableNotAvailableError)
            expect((await repo.findById(created.id))?.status).toBe('libre')
        })

        it('should throw TableNotFoundError for a non-existent table or one of another restaurant', async () => {
            const created = await service.create({ number: 1, capacity: 4, restaurantId: 'r1' })

            await expect(service.occupy('r1', 'no-existe', 2)).rejects.toThrow(TableNotFoundError)
            await expect(service.occupy('r2', created.id, 2)).rejects.toThrow(TableNotFoundError)
        })

        it.each([0, -1, 2.5, '2', undefined])('should reject people = %s before looking up the table', async (people) => {
            await expect(service.occupy('r1', 'no-existe', people)).rejects.toThrow(InvalidPeopleError)
        })
    })
})
