import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Item } from '../models/item.model';

@Injectable({
  providedIn: 'root',
})
export class ItemService {
  private readonly itemsEndpoint = `${environment.apiBaseUrl.replace(/\/+$/, '')}/items`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Retrieves the list of items stored in MongoDB from the Express backend API.
   */
  getItems(): Observable<Item[]> {
    return this.http.get<Item[]>(this.itemsEndpoint);
  }
}
