import { InvalidTableStatusError } from '@errors/DomainErrors.js'

const VALID_TABLE_STATUSES = ['libre', 'ocupada', 'reservada'] as const

export type TableStatusType = typeof VALID_TABLE_STATUSES[number]

export interface Table {
    id: string
    number: number
    description: string | null
    capacity: number
    status: TableStatusType
    restaurantId: string
    createdAt: string
    updatedAt: string
}

export function normalizeTableStatus(value: string): TableStatusType {
    if (!value || typeof value !== 'string') {
        throw new InvalidTableStatusError('Debe indicarse un estado de mesa')
    }

    const normalizedValue = value.trim().toLowerCase()
    if (!VALID_TABLE_STATUSES.includes(normalizedValue as TableStatusType)) {
        throw new InvalidTableStatusError(`Estado de mesa inválido: ${value}. Debe ser uno de: ${VALID_TABLE_STATUSES.join(', ')}`)
    }
    return normalizedValue as TableStatusType
}
