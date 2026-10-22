import { describe, it, expect } from 'vitest'
import { normalizeDishCategory, validateDishIngredient } from '@models/dish.model.js'

describe('dish.model', () => {
    it('should throw a Spanish message for an invalid category', () => {
        expect(() => normalizeDishCategory('sopa')).toThrow('Categoría inválida: sopa. Debe ser uno de:')
    })

    it('should throw a Spanish message for an empty ingredient id', () => {
        expect(() => validateDishIngredient({ ingredientId: '', quantity: 1 })).toThrow('El ID del ingrediente es obligatorio')
    })

    it('should throw a Spanish message for a non-positive ingredient quantity', () => {
        expect(() => validateDishIngredient({ ingredientId: 'ing-1', quantity: 0 })).toThrow('La cantidad del ingrediente debe ser positiva')
    })
})
