import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Database } from '@config/database.js'

describe('Database: tabla restaurant_tables', () => {
    let db: Database
    const now = new Date().toISOString()

    beforeAll(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        await db.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['r1', 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', now, now]
        )
    })

    afterAll(async () => {
        await db.close()
    })

    it('should create the table with status libre by default', async () => {
        await db.run(
            'INSERT INTO restaurant_tables (id, number, description, capacity, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['t1', 1, null, 4, 'r1', now, now]
        )
        const row = await db.get<{ status: string }>('SELECT status FROM restaurant_tables WHERE id = ?', ['t1'])
        expect(row?.status).toBe('libre')
    })

    it('should reject a repeated number in the same restaurant', async () => {
        await expect(db.run(
            'INSERT INTO restaurant_tables (id, number, description, capacity, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['t2', 1, null, 2, 'r1', now, now]
        )).rejects.toThrow('UNIQUE')
    })

    it('should reject a non-existent restaurant', async () => {
        await expect(db.run(
            'INSERT INTO restaurant_tables (id, number, description, capacity, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['t3', 2, null, 2, 'no-existe', now, now]
        )).rejects.toThrow('FOREIGN KEY')
    })
})
