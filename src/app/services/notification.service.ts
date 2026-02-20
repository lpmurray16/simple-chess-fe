import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, Channel, PermissionStatus } from '@capacitor/local-notifications';

@Injectable({
    providedIn: 'root',
})
export class NotificationService {
    constructor() {}

    async init() {
        if (Capacitor.isNativePlatform()) {
            await this.requestPermissions();
            await this.createNotificationChannel();
        }
    }

    async requestPermissions(): Promise<boolean> {
        const result: PermissionStatus = await LocalNotifications.requestPermissions();
        return result.display === 'granted';
    }

    async createNotificationChannel() {
        // Channel is for Android only
        if (Capacitor.getPlatform() === 'android') {
            const channel: Channel = {
                id: 'game_updates',
                name: 'Game Updates',
                description: 'Notifications for game events like player turns',
                importance: 4, // High importance
                visibility: 1, // Public
                vibration: true,
            };
            await LocalNotifications.createChannel(channel);
        }
    }

    async scheduleTurnNotification(delayInSeconds: number = 5) {
        if (!(await this.hasPermissions())) return;

        await LocalNotifications.schedule({
            notifications: [
                {
                    id: 1, // A unique ID for this notification type
                    title: 'Your Move!',
                    body: "It's your turn to make a move in your chess game.",
                    schedule: { at: new Date(Date.now() + delayInSeconds * 1000) },
                    channelId: 'game_updates', // Must match the channel ID
                },
            ],
        });
    }

    async cancelPendingNotifications() {
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
            await LocalNotifications.cancel(pending);
        }
    }

    private async hasPermissions(): Promise<boolean> {
        const status: PermissionStatus = await LocalNotifications.checkPermissions();
        return status.display === 'granted';
    }
}
