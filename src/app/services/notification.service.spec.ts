import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { ToastService } from './toast.service';

describe('NotificationService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        TestBed.resetTestingModule();
    });

    it('initializes web push only once when init is called repeatedly', async () => {
        TestBed.configureTestingModule({
            providers: [
                NotificationService,
                { provide: AuthService, useValue: {} },
                { provide: ToastService, useValue: {} },
                { provide: HttpClient, useValue: {} },
                { provide: SwPush, useValue: { isEnabled: false } },
            ],
        });

        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

        const service = TestBed.inject(NotificationService);
        const subscribeSpy = vi.spyOn(service, 'subscribeToPush').mockResolvedValue();

        await service.init();
        await Promise.all([service.init(), service.init()]);

        expect(subscribeSpy).toHaveBeenCalledTimes(1);
    });
});
