import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast, ToastType } from '../../services/toast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
})
export class ToastComponent implements OnInit, OnDestroy {
  private toastService = inject(ToastService);
  private sub?: Subscription;

  toasts: Toast[] = [];

  ngOnInit() {
    this.sub = this.toastService.toasts$.subscribe((toasts) => {
      this.toasts = toasts;
      toasts.forEach((toast) => {
        if (toast.duration && toast.duration > 0) {
          setTimeout(() => this.remove(toast.id), toast.duration);
        }
      });
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  remove(id: number) {
    const toast = this.toasts.find((t) => t.id === id);
    if (toast) {
      // Trigger exit animation
      toast.exiting = true;
      setTimeout(() => this.toastService.remove(id), 250);
    } else {
      this.toastService.remove(id);
    }
  }

  getIcon(type: ToastType): string {
    switch (type) {
      case 'success':
        return '<i class="fa-solid fa-circle-check"></i>';
      case 'error':
        return '<i class="fa-solid fa-circle-exclamation"></i>';
      case 'warning':
        return '<i class="fa-solid fa-triangle-exclamation"></i>';
      case 'info':
      default:
        return '<i class="fa-solid fa-circle-info"></i>';
    }
  }
}