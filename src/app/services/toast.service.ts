import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration?: number;
  exiting?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  public toasts$ = this.toastsSubject.asObservable();

  private idCounter = 0;

  private getNextId(): number {
    return ++this.idCounter;
  }

  private addToast(message: string, type: ToastType, duration: number = 3000): number {
    const id = this.getNextId();
    const toast: Toast = { id, message, type, duration };
    const current = this.toastsSubject.value;
    this.toastsSubject.next([...current, toast]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }

    return id;
  }

  success(message: string, duration?: number): number {
    return this.addToast(message, 'success', duration);
  }

  error(message: string, duration?: number): number {
    return this.addToast(message, 'error', duration);
  }

  info(message: string, duration?: number): number {
    return this.addToast(message, 'info', duration);
  }

  warning(message: string, duration?: number): number {
    return this.addToast(message, 'warning', duration);
  }

  remove(id: number): void {
    const current = this.toastsSubject.value;
    this.toastsSubject.next(current.filter((t) => t.id !== id));
  }

  clear(): void {
    this.toastsSubject.next([]);
  }
}