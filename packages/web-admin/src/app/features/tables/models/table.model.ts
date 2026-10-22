export type TableStatus = 'libre' | 'ocupada' | 'reservada'

export interface Table {
  id: string
  number: number
  description: string | null
  capacity: number
  status: TableStatus
  restaurantId: string
  createdAt: string
  updatedAt: string
}

export interface CreateTableDto {
  number: number
  description: string | null
  capacity: number
  status?: TableStatus
}

// PUT es un reemplazo completo; `status` es opcional y, si se omite, la API conserva el actual
export interface UpdateTableDto {
  number: number
  description: string | null
  capacity: number
  status?: TableStatus
}
