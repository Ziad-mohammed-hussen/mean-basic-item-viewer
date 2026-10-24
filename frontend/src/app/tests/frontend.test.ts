import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { of, Subject, throwError } from 'rxjs';
import { environment as prodEnv } from '../../environments/environment';
import { environment as devEnv } from '../../environments/environment.development';
import { AppComponent } from '../app.component';
import { Item } from '../models/item.model';
import { ItemService } from '../services/item.service';

describe('MEAN Stack Basic Item Viewer — Frontend Verification Suite', () => {
  describe('1. Environment Configuration Separation', () => {
    it('configures production environment without localhost URLs or credentials', () => {
      assert.equal(prodEnv.production, true);
      assert.ok(!prodEnv.apiBaseUrl.includes('localhost'));
      assert.ok(!JSON.stringify(prodEnv).includes('mongodb'));
    });

    it('configures development environment to target local Express API', () => {
      assert.equal(devEnv.production, false);
      assert.equal(devEnv.apiBaseUrl, 'http://localhost:3000/api');
    });
  });

  describe('2. ItemService HTTP Integration', () => {
    it('requests items from the configured /items API endpoint via HttpClient', () => {
      let requestedUrl = '';
      const mockItems: Item[] = [
        {
          _id: '671a00000000000000000001',
          name: 'Mechanical Wireless Keyboard',
          description: 'Compact 75% tactile mechanical keyboard.',
          category: 'Electronics',
        },
      ];

      const mockHttpClient = {
        get: (url: string) => {
          requestedUrl = url;
          return of(mockItems);
        },
      } as any;

      const service = new ItemService(mockHttpClient);
      let received: Item[] = [];
      service.getItems().subscribe((res) => {
        received = res;
      });

      assert.ok(requestedUrl.endsWith('/items'));
      assert.deepEqual(received, mockItems);
    });
  });

  describe('3. AppComponent State Management (Loading, Populated, Empty, Error)', () => {
    it('exposes the required page title "Basic Item Viewer" and descriptive subtitle', () => {
      const mockService = { getItems: () => of([]) } as unknown as ItemService;
      const component = new AppComponent(mockService);

      assert.equal(component.title, 'Basic Item Viewer');
      assert.ok(component.subtitle.toLowerCase().includes('database'));
    });

    it('maintains loading state while waiting for API response and populates items on resolution', () => {
      const stream$ = new Subject<Item[]>();
      const mockService = {
        getItems: () => stream$.asObservable(),
      } as unknown as ItemService;

      const component = new AppComponent(mockService);
      component.ngOnInit();

      // Loading state before emission
      assert.equal(component.isLoading, true);
      assert.equal(component.errorMessage, null);
      assert.equal(component.items.length, 0);

      // Emit database records
      const dbRecords: Item[] = [
        {
          _id: '671a00000000000000000001',
          name: 'Ergonomic Mesh Office Chair',
          description: 'Lumbar support chair.',
          category: 'Office Furniture',
        },
      ];
      stream$.next(dbRecords);
      stream$.complete();

      assert.equal(component.isLoading, false);
      assert.equal(component.errorMessage, null);
      assert.deepEqual(component.items, dbRecords);
    });

    it('renders empty state cleanly when database returns zero records', () => {
      const mockService = {
        getItems: () => of([]),
      } as unknown as ItemService;

      const component = new AppComponent(mockService);
      component.ngOnInit();

      assert.equal(component.isLoading, false);
      assert.equal(component.errorMessage, null);
      assert.deepEqual(component.items, []);
    });

    it('shows friendly error message and never substitutes hardcoded data on HTTP 503 failure', () => {
      const error503 = new HttpErrorResponse({
        status: 503,
        statusText: 'Service Unavailable',
        error: {
          error: 'Service Unavailable',
          message: 'Database connection is not ready.',
        },
      });

      const mockService = {
        getItems: () => throwError(() => error503),
      } as unknown as ItemService;

      const component = new AppComponent(mockService);
      component.ngOnInit();

      assert.equal(component.isLoading, false);
      assert.deepEqual(component.items, []);
      assert.ok(component.errorMessage);
      assert.ok(component.errorMessage.toLowerCase().includes('mongodb'));
    });

    it('shows friendly error message when backend is unreachable (status 0)', () => {
      const error0 = new HttpErrorResponse({
        status: 0,
        statusText: 'Unknown Error',
      });

      const mockService = {
        getItems: () => throwError(() => error0),
      } as unknown as ItemService;

      const component = new AppComponent(mockService);
      component.ngOnInit();

      assert.equal(component.isLoading, false);
      assert.deepEqual(component.items, []);
      assert.ok(component.errorMessage);
      assert.ok(component.errorMessage.toLowerCase().includes('unable to reach'));
    });
  });

  describe('4. End-to-End Payload Contract (MongoDB/Express API -> ItemService -> AppComponent)', () => {
    it('processes a full multi-record MongoDB API payload through ItemService into AppComponent', () => {
      const apiPayload: Item[] = [
        {
          _id: '671a00000000000000000001',
          name: 'Mechanical Wireless Keyboard',
          description:
            'Compact 75% tactile mechanical keyboard with multi-device Bluetooth and USB-C connectivity.',
          category: 'Electronics',
          createdAt: '2026-10-24T18:00:00.000Z',
          updatedAt: '2026-10-24T18:00:00.000Z',
        },
        {
          _id: '671a00000000000000000002',
          name: 'Ergonomic Mesh Office Chair',
          description:
            'Breathable lumbar-support desk chair with adjustable armrests and synchronized tilt mechanism.',
          category: 'Office Furniture',
          createdAt: '2026-10-24T18:00:00.000Z',
          updatedAt: '2026-10-24T18:00:00.000Z',
        },
        {
          _id: '671a00000000000000000003',
          name: 'Designing Data-Intensive Applications',
          description:
            'Comprehensive engineering reference covering distributed systems, database reliability, and scalable architectures.',
          category: 'Books',
          createdAt: '2026-10-24T18:00:00.000Z',
          updatedAt: '2026-10-24T18:00:00.000Z',
        },
      ];

      const mockHttpClient = {
        get: (url: string) => {
          assert.ok(url.endsWith('/api/items'));
          return of(apiPayload);
        },
      } as any;

      const itemService = new ItemService(mockHttpClient);
      const component = new AppComponent(itemService);
      component.ngOnInit();

      assert.equal(component.isLoading, false);
      assert.equal(component.errorMessage, null);
      assert.equal(component.items.length, 3);
      assert.equal(
        component.trackByItemId(0, component.items[0]),
        '671a00000000000000000001'
      );
      assert.equal(component.items[2].category, 'Books');
    });
  });
});
