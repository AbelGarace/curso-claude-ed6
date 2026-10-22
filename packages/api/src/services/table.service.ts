import { randomUUID } from 'crypto'
import type { Table, TableStatusType } from '@models/table.model.js'
import { normalizeTableStatus } from '@models/table.model.js'
import type { TableRepository } from '@repositories/table.repository.js'
import {
    DuplicatedTableNumberError,
    InvalidCapacityError,
    InvalidTableNumberError,
    RestaurantIdRequiredError,
    TableNotFoundError
} from '@errors/DomainErrors.js'

// Los campos llegan tal cual del body JSON: se validan aquí
export interface CreateTableDTO {
    number: unknown
    description?: unknown
    capacity: unknown
    status?: unknown
    restaurantId: string
}

export interface UpdateTableDTO {
    number?: unknown
    description?: unknown
    capacity?: unknown
    status?: unknown
}

export class TableService {
    constructor(private readonly tableRepository: TableRepository) {}

    async create(dto: CreateTableDTO): Promise<Table> {
        const now = new Date().toISOString()
        const table = await this.buildTable({
            id: randomUUID(),
            number: dto.number,
            description: dto.description,
            capacity: dto.capacity,
            status: dto.status ?? 'libre',
            restaurantId: dto.restaurantId,
            createdAt: now,
            updatedAt: now
        })

        await this.tableRepository.save(table)
        return table
    }

    // PUT: reemplaza número, descripción y capacidad; el estado se conserva si no se envía
    async update(restaurantId: string, id: string, dto: UpdateTableDTO): Promise<Table> {
        const existing = await this.getOwnedTable(restaurantId, id)

        const updated = await this.buildTable({
            id: existing.id,
            number: dto.number,
            description: dto.description,
            capacity: dto.capacity,
            status: dto.status ?? existing.status,
            restaurantId: existing.restaurantId,
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString()
        })

        await this.tableRepository.save(updated)
        return updated
    }

    private async getOwnedTable(restaurantId: string, id: string): Promise<Table> {
        const table = await this.tableRepository.findById(id)
        if (!table || table.restaurantId !== restaurantId) {
            throw new TableNotFoundError()
        }
        return table
    }

    private async buildTable(props: {
        id: string
        number: unknown
        description: unknown
        capacity: unknown
        status: unknown
        restaurantId: string
        createdAt: string
        updatedAt: string
    }): Promise<Table> {
        if (!isPositiveInteger(props.number)) {
            throw new InvalidTableNumberError()
        }
        if (!isPositiveInteger(props.capacity)) {
            throw new InvalidCapacityError()
        }
        const status: TableStatusType = normalizeTableStatus(props.status as string)
        if (!props.restaurantId || props.restaurantId.trim() === '') {
            throw new RestaurantIdRequiredError()
        }

        const sameNumber = await this.tableRepository.findByNumber(props.restaurantId, props.number)
        if (sameNumber && sameNumber.id !== props.id) {
            throw new DuplicatedTableNumberError()
        }

        return {
            id: props.id,
            number: props.number,
            description: normalizeDescription(props.description),
            capacity: props.capacity,
            status,
            restaurantId: props.restaurantId,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt
        }
    }
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function normalizeDescription(value: unknown): string | null {
    if (typeof value !== 'string' || value.trim() === '') {
        return null
    }
    return value.trim()
}
