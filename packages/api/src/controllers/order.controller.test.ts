import { describe, it, expect, vi } from 'vitest'
import type { Request, Response } from 'express'
import { OrderController } from '@controllers/order.controller.js'
import type { OrderService } from '@services/order.service.js'

const buildRes = () => {
    const res = {} as Response & { body?: unknown, statusCode?: number }
    res.status = vi.fn((code: number) => { res.statusCode = code; return res }) as any
    res.json = vi.fn((body: unknown) => { res.body = body; return res }) as any
    return res
}

describe('OrderController: mensajes en español', () => {
    it('getActiveOrders responde 400 si falta restaurantId', async () => {
        const controller = new OrderController({} as OrderService)
        const res = buildRes()
        await controller.getActiveOrders({ query: {} } as unknown as Request, res)
        expect(res.statusCode).toBe(400)
        expect(res.body).toEqual({ error: 'El ID del restaurante es obligatorio' })
    })

    it('getActiveOrders responde 500 en español ante un error inesperado', async () => {
        const service = { listActive: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as OrderService
        const controller = new OrderController(service)
        const res = buildRes()
        await controller.getActiveOrders({ query: { restaurantId: 'rest-1' } } as unknown as Request, res)
        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({ error: 'Error interno del servidor' })
    })

    it('getMyOrders responde 401 en español sin usuario', async () => {
        const controller = new OrderController({} as OrderService)
        const res = buildRes()
        await controller.getMyOrders({} as Request, res)
        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({ error: 'No autorizado' })
    })
})
