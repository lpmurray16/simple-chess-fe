import { ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameService } from '../../services/game.service';
import { OverlayComponent } from './overlay.component';

describe('OverlayComponent', () => {
    let capture$: Subject<void>;
    let component: OverlayComponent;

    beforeEach(() => {
        vi.useFakeTimers();
        capture$ = new Subject<void>();
        component = new OverlayComponent(
            { capture$ } as GameService,
            { detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
        );
        component.ngOnInit();
    });

    afterEach(() => {
        component.ngOnDestroy();
        vi.useRealTimers();
    });

    it('shows a loading state until the capture GIF has loaded', () => {
        capture$.next();

        expect(component.isVisible).toBe(true);
        expect(component.isLoading).toBe(true);

        vi.advanceTimersByTime(7000);
        expect(component.isVisible).toBe(true);

        component.onGifLoad();

        expect(component.isLoading).toBe(false);
        vi.advanceTimersByTime(7000);
        expect(component.isVisible).toBe(false);
    });

    it('shows a temporary fallback when the capture GIF fails to load', () => {
        capture$.next();

        component.onGifError();

        expect(component.isLoading).toBe(false);
        expect(component.loadError).toBe(true);

        vi.advanceTimersByTime(3000);
        expect(component.isVisible).toBe(false);
    });
});
