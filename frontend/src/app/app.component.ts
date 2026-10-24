import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Item } from './models/item.model';
import { ItemService } from './services/item.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  readonly title = 'Basic Item Viewer';
  readonly subtitle =
    'A read-only directory displaying items retrieved directly from the MongoDB database.';

  items: Item[] = [];
  isLoading = true;
  errorMessage: string | null = null;

  constructor(private readonly itemService: ItemService) {}

  ngOnInit(): void {
    this.fetchItems();
  }

  fetchItems(): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.itemService.getItems().subscribe({
      next: (records) => {
        this.items = Array.isArray(records) ? records : [];
        this.isLoading = false;
      },
      error: (err: unknown) => {
        this.items = [];
        this.isLoading = false;
        this.errorMessage = this.resolveFriendlyErrorMessage(err);
      },
    });
  }

  trackByItemId(_index: number, item: Item): string {
    return item._id;
  }

  private resolveFriendlyErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return 'Unable to reach the backend API server. Please ensure the server is running and accessible.';
      }
      if (err.status === 503) {
        return 'The backend server is running, but the MongoDB database connection is currently unavailable.';
      }
      if (err.error && typeof err.error.message === 'string') {
        return err.error.message;
      }
    }
    return 'Unable to load items from the database at this time. Please try again shortly.';
  }
}
