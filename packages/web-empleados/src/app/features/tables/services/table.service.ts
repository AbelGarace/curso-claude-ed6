import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChangeTableStatusDto, Table, TableStatus } from '../models/table.model';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);

  private baseUrl(restaurantId: string): string {
    return `${environment.apiUrl}/restaurants/${restaurantId}/tables`;
  }

  getAll(restaurantId: string): Observable<Table[]> {
    return this.http.get<Table[]>(this.baseUrl(restaurantId));
  }

  changeStatus(restaurantId: string, id: string, status: TableStatus): Observable<Table> {
    const dto: ChangeTableStatusDto = { status };
    return this.http.patch<Table>(`${this.baseUrl(restaurantId)}/${id}/status`, dto);
  }
}
