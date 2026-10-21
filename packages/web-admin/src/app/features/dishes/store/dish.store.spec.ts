import '@angular/compiler'
import { Injector } from '@angular/core'
import { Subject } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { DishService } from '../services/dish.service'
import { DishStore } from './dish.store'
import type { Dish } from '../models/dish.model'

const plato = (id: string, restaurantId: string) => ({ id, restaurantId, name: id }) as unknown as Dish

describe('DishStore.loadByRestaurant', () => {
  it('descarta la respuesta tardía de un restaurante anterior', async () => {
    const respuestas: Record<string, Subject<Dish[]>> = { '1': new Subject(), '2': new Subject() }
    const service = { getAll: (id: string) => respuestas[id] }
    const injector = Injector.create({
      providers: [
        { provide: DishService, useValue: service },
        { provide: DishStore, useClass: DishStore, deps: [] }
      ]
    })
    const store = injector.get(DishStore)

    const carga1 = store.loadByRestaurant('1')
    const carga2 = store.loadByRestaurant('2')

    respuestas['2'].next([plato('b', '2')])
    respuestas['2'].complete()
    await carga2
    expect(store.dishes().map(d => d.id)).toEqual(['b'])
    expect(store.loading()).toBe(false)

    respuestas['1'].next([plato('a', '1')])
    respuestas['1'].complete()
    await carga1
    expect(store.dishes().map(d => d.id)).toEqual(['b'])
    expect(store.loading()).toBe(false)
  })
})
