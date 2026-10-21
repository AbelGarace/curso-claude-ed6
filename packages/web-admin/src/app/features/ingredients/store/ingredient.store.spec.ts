import '@angular/compiler'
import { Injector } from '@angular/core'
import { Subject } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { IngredientService } from '../services/ingredient.service'
import { IngredientStore } from './ingredient.store'
import type { Ingredient } from '../models/ingredient.model'

const ingrediente = (id: string, restaurantId: string) => ({ id, restaurantId, name: id }) as unknown as Ingredient

describe('IngredientStore.loadByRestaurant', () => {
  it('descarta la respuesta tardía de un restaurante anterior', async () => {
    const respuestas: Record<string, Subject<Ingredient[]>> = { '1': new Subject(), '2': new Subject() }
    const service = { getAll: (id: string) => respuestas[id] }
    const injector = Injector.create({
      providers: [
        { provide: IngredientService, useValue: service },
        { provide: IngredientStore, useClass: IngredientStore, deps: [] }
      ]
    })
    const store = injector.get(IngredientStore)

    const carga1 = store.loadByRestaurant('1')
    const carga2 = store.loadByRestaurant('2')

    respuestas['2'].next([ingrediente('b', '2')])
    respuestas['2'].complete()
    await carga2
    expect(store.ingredients().map(i => i.id)).toEqual(['b'])
    expect(store.loading()).toBe(false)

    respuestas['1'].next([ingrediente('a', '1')])
    respuestas['1'].complete()
    await carga1
    expect(store.ingredients().map(i => i.id)).toEqual(['b'])
    expect(store.loading()).toBe(false)
  })
})
