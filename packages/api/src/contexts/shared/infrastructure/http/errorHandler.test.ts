import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'
import {
    TableNotFoundError,
    InvalidTableNumberError,
    InvalidCapacityError,
    InvalidTableStatusError,
    InvalidPeopleError,
    DuplicatedTableNumberError,
    TableNotAvailableError,
    TableOccupiedError
} from '@errors/DomainErrors.js'

const respondWith = async (error: Error) => {
    const app = express()
    app.get('/', () => {
        throw error
    })
    app.use(errorHandler)
    return request(app).get('/')
}

describe('errorHandler: errores de mesa', () => {
    it.each([
        [new TableNotFoundError(), 404, 'Mesa no encontrada'],
        [new InvalidTableNumberError(), 400, 'El número de mesa debe ser un entero mayor que 0'],
        [new InvalidCapacityError(), 400, 'La capacidad debe ser un entero mayor que 0'],
        [new InvalidTableStatusError(), 400, 'Estado de mesa inválido'],
        [new InvalidPeopleError(), 400, 'El número de comensales debe ser un entero mayor que 0'],
        [new DuplicatedTableNumberError(), 409, 'Ya existe una mesa con ese número en este restaurante'],
        [new TableNotAvailableError(), 409, 'La mesa no está disponible para ese número de comensales'],
        [new TableOccupiedError(), 409, 'No se puede borrar una mesa ocupada']
    ])('%s responde %i con su mensaje en español', async (error, status, message) => {
        const res = await respondWith(error)
        expect(res.status).toBe(status)
        expect(res.body).toEqual({ error: error.name, message })
    })
})
