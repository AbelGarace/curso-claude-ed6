import { Component, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { AuthStore } from '@resttek/web-shared';
import { OrderStore } from '../../../orders/store/order.store';
import { Order } from '../../../orders/models/order.model';
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
  private readonly orderStore = inject(OrderStore);

  readonly statuses: TableStatus[] = ['libre', 'ocupada', 'reservada'];

  /** Solo el gerente y el camarero pueden cambiar el estado; el resto ve las mesas en modo lectura. */
  readonly canChangeStatus = computed(() => {
    const role = this.authStore.userRole();
    return role === 'manager' || role === 'camarero';
  });

  /** Pedidos activos por mesa (`Order.tableId`), con solo los platos aún no entregados. */
  readonly activeOrdersByTable = computed(() => {
    const byTable = new Map<string, Order[]>();
    for (const order of this.orderStore.orders()) {
      if (!order.tableId) continue;
      const items = order.items.filter(item => item.status !== 'entregado');
      if (items.length === 0) continue;
      byTable.set(order.tableId, [...(byTable.get(order.tableId) ?? []), { ...order, items }]);
    }
    return byTable;
  });

  private get restaurantId(): string | undefined {
    return this.authStore.user()?.restaurantId;
  }

  ngOnInit(): void {
    if (this.restaurantId) {
      this.tableStore.startPolling(this.restaurantId);
      this.orderStore.startPolling(this.restaurantId);
    }
  }

  ngOnDestroy(): void {
    this.tableStore.stopPolling();
    this.orderStore.stopPolling();
  }

  onStatusChange(tableId: string, event: Event): void {
    const restaurantId = this.restaurantId;
    if (!restaurantId) return;
    const status = (event.target as HTMLSelectElement).value as TableStatus;
    this.tableStore.changeStatus(restaurantId, tableId, status);
  }
}
