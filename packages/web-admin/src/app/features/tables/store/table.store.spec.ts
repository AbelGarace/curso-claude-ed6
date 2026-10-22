import '@angular/compiler'
import { Injector } from '@angular/core'
import { Subject, of } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { TableService } from '../services/table.service'
import { TableStore } from './table.store'
import type { Table } from '../models/table.model'

const mesa = (id: string, number: number, restaurantId = '1') =>
  ({ id, number, restaurantId, capacity: 4, description: null, status: 'libre' }) as unknown as Table

function crearStore(service: Partial<TableService>): TableStore {
  const injector = Injector.create({
    providers: [
      { provide: TableService, useValue: service },
      { provide: TableStore, useClass: TableStore, deps: [] }
    ]
  })
  return injector.get(TableStore)
}

describe('TableStore.loadByRestaurant', () => {
  it('descarta la respuesta tardía de un restaurante anterior', async () => {
    const respuestas: Record<string, Subject<Table[]>> = { '1': new Subject(), '2': new Subject() }
    const store = crearStore({ getAll: (id: string) => respuestas[id] })

    const carga1 = store.loadByRestaurant('1')
    const carga2 = store.loadByRestaurant('2')

    respuestas['2'].next([mesa('b', 1, '2')])
    respuestas['2'].complete()
    await carga2
    expect(store.tables().map(t => t.id)).toEqual(['b'])
    expect(store.loading()).toBe(false)

    respuestas['1'].next([mesa('a', 1, '1')])
    respuestas['1'].complete()
    await carga1
    expect(store.tables().map(t => t.id)).toEqual(['b'])
    expect(store.loading()).toBe(false)
  })
})

describe('TableStore mutaciones', () => {
  it('create mantiene la lista ordenada por número', async () => {
    const store = crearStore({
      getAll: () => of([mesa('a', 1), mesa('c', 3)]),
      create: () => of(mesa('b', 2))
    })
    await store.loadByRestaurant('1')
    await store.create('1', { number: 2, description: null, capacity: 4 })
    expect(store.tables().map(t => t.number)).toEqual([1, 2, 3])
  })

  it('update sustituye la mesa y reordena', async () => {
    const store = crearStore({
      getAll: () => of([mesa('a', 1), mesa('b', 2)]),
      update: () => of(mesa('a', 5))
    })
    await store.loadByRestaurant('1')
    await store.update('1', 'a', { number: 5, description: null, capacity: 4 })
    expect(store.tables().map(t => t.number)).toEqual([2, 5])
  })

  it('delete elimina la mesa de la lista', async () => {
    const store = crearStore({
      getAll: () => of([mesa('a', 1), mesa('b', 2)]),
      delete: () => of(undefined)
    })
    await store.loadByRestaurant('1')
    await store.delete('1', 'a')
    expect(store.tables().map(t => t.id)).toEqual(['b'])
  })
})
