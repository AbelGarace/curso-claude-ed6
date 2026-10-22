import { Component, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { AuthStore } from '@resttek/web-shared';
import { TableStatus } from '../../models/table.model';
import { TableStore } from '../../store/table.store';

@Component({
  selector: 'app-mesas',
  standalone: true,
  templateUrl: './mesas.component.html',
  styleUrl: './mesas.component.css'
})
export class MesasComponent implements OnInit, OnDestroy {
  private readonly authStore = inject(AuthStore);
  readonly tableStore = inject(TableStore);

  readonly statuses: TableStatus[] = ['libre', 'ocupada', 'reservada'];

  /** Solo el gerente y el camarero pueden cambiar el estado; el resto ve las mesas en modo lectura. */
  readonly canChangeStatus = computed(() => {
    const role = this.authStore.userRole();
    return role === 'manager' || role === 'camarero';
  });

  private get restaurantId(): string | undefined {
    return this.authStore.user()?.restaurantId;
  }

  ngOnInit(): void {
    if (this.restaurantId) {
      this.tableStore.startPolling(this.restaurantId);
    }
  }

  ngOnDestroy(): void {
    this.tableStore.stopPolling();
  }

  onStatusChange(tableId: string, event: Event): void {
    const restaurantId = this.restaurantId;
    if (!restaurantId) return;
    const status = (event.target as HTMLSelectElement).value as TableStatus;
    this.tableStore.changeStatus(restaurantId, tableId, status);
  }
}
