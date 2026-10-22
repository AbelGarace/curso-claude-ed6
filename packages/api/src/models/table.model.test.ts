import { describe, it, expect } from 'vitest'
import { normalizeTableStatus } from '@models/table.model.js'
import { InvalidTableStatusError } from '@errors/DomainErrors.js'

describe('normalizeTableStatus', () => {
    it('should accept all valid statuses', () => {
        for (const status of ['libre', 'ocupada', 'reservada']) {
            expect(normalizeTableStatus(status)).toBe(status)
        }
    })

    it('should normalize case and spaces', () => {
        expect(normalizeTableStatus('  LIBRE ')).toBe('libre')
    })

    it('should throw InvalidTableStatusError for an invalid status', () => {
        expect(() => normalizeTableStatus('rota')).toThrow(InvalidTableStatusError)
        expect(() => normalizeTableStatus('rota')).toThrow('Estado de mesa inválido: rota. Debe ser uno de: libre, ocupada, reservada')
    })

    it('should throw InvalidTableStatusError for a missing status', () => {
        expect(() => normalizeTableStatus('')).toThrow('Debe indicarse un estado de mesa')
        expect(() => normalizeTableStatus(undefined as unknown as string)).toThrow('Debe indicarse un estado de mesa')
        expect(() => normalizeTableStatus(3 as unknown as string)).toThrow('Debe indicarse un estado de mesa')
    })
})
