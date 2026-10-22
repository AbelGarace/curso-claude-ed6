import { Component, inject, signal } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TableService } from '../../core/services/table.service'
import { CartStore } from '../../core/store/cart.store'
import { Table } from '../../core/models/table.model'

@Component({
  selector: 'app-table-selection',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container">
      <div class="page-header">
        <div>
          <a routerLink="/restaurants" class="back-link">← Volver a restaurantes</a>
          <h1>¿Cuántos sois?</h1>
          <p>Indica el número de comensales y elige una mesa libre</p>
        </div>
      </div>

      <form class="people-form card" (submit)="search($event)">
        <div class="form-group">
          <label for="people">Comensales</label>
          <input
            id="people"
            class="form-control"
            type="number"
            min="1"
            step="1"
            [value]="people() ?? ''"
            (input)="onPeopleInput($any($event.target).value)"
          />
        </div>
        <button class="btn btn-primary" type="submit" [disabled]="people() === null || loading()">
          Buscar mesas
        </button>
      </form>

      @if (error()) {
        <div class="alert-error">{{ error() }}</div>
      }

      @if (loading()) {
        <div class="spinner"></div>
      } @else if (searched()) {
        @if (tables().length === 0) {
          <div class="empty-state card">
            <p>No hay mesas libres para {{ searchedPeople() }} comensales</p>
          </div>
        } @else {
          <div class="table-grid">
            @for (table of tables(); track table.id) {
              <button
                type="button"
                class="table-card card"
                [class.selected]="selectedId() === table.id"
                (click)="select(table)"
              >
                <strong>Mesa {{ table.number }}</strong>
                <span class="capacity">Hasta {{ table.capacity }} personas</span>
                @if (table.description) {
                  <span class="description">{{ table.description }}</span>
                }
              </button>
            }
          </div>
          <button
            type="button"
            class="btn btn-primary continue-btn"
            [disabled]="selectedId() === null || occupying()"
            (click)="continue()"
          >
            Continuar
          </button>
        }
      }
    </div>
  `,
  styles: [`
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .people-form {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .people-form .form-group {
      margin: 0;
      flex: 1;
    }
    .table-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
    }
    .table-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 16px;
      text-align: left;
      cursor: pointer;
      color: inherit;
      transition: all var(--transition);
    }
    .table-card:hover,
    .table-card.selected {
      border-color: var(--green-medium);
    }
    .table-card.selected {
      background: var(--bg-hover);
    }
    .continue-btn {
      width: 100%;
      justify-content: center;
      margin-top: 24px;
    }
    .capacity,
    .description {
      font-size: 13px;
      color: var(--text-muted);
    }
  `]
})
export class TableSelectionComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly tableService = inject(TableService)
  private readonly cartStore = inject(CartStore)

  private readonly restaurantId = this.route.snapshot.paramMap.get('id')!

  readonly people = signal<number | null>(null)
  readonly tables = signal<Table[]>([])
  readonly selectedId = signal<string | null>(null)
  readonly searched = signal(false)
  readonly searchedPeople = signal<number | null>(null)
  readonly loading = signal(false)
  readonly occupying = signal(false)
  readonly error = signal<string | null>(null)

  onPeopleInput(value: string): void {
    const n = Number(value)
    this.people.set(value !== '' && Number.isInteger(n) && n > 0 ? n : null)
  }

  search(event?: Event): void {
    event?.preventDefault()
    this.loadTables(null)
  }

  private loadTables(notice: string | null): void {
    const people = this.people()
    if (people === null) return

    this.loading.set(true)
    this.error.set(null)
    this.selectedId.set(null)

    this.tableService.getAvailable(this.restaurantId, people).subscribe({
      next: (tables) => {
        this.tables.set(tables)
        this.searchedPeople.set(people)
        this.searched.set(true)
        this.error.set(notice)
        this.loading.set(false)
      },
      error: () => {
        this.error.set('Error al cargar las mesas disponibles')
        this.loading.set(false)
      }
    })
  }

  select(table: Table): void {
    this.selectedId.set(table.id)
  }

  continue(): void {
    const tableId = this.selectedId()
    const people = this.people()
    if (!tableId || people === null) return

    this.occupying.set(true)
    this.error.set(null)

    this.tableService.occupy(this.restaurantId, tableId, people).subscribe({
      next: (table) => {
        this.cartStore.setTable(this.restaurantId, table.id)
        this.occupying.set(false)
        this.router.navigate(['/restaurants', this.restaurantId])
      },
      error: (err) => {
        this.occupying.set(false)
        if (err.status === 409) {
          this.loadTables('La mesa ya no está disponible. Elige otra, por favor.')
        } else {
          this.error.set('No se ha podido ocupar la mesa. Inténtalo de nuevo.')
        }
      }
    })
  }
}
