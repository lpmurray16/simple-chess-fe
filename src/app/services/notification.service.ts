import { AuthService } from './auth.service';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, Channel, PermissionStatus } from '@capacitor/local-notifications';
import { SwPush } from '@angular/service-worker';
import { Functions, httpsCallable } from '@angular/fire/functions';

@Injectable({
    providedIn: 'root',
})
export class NotificationService {
    private auth = inject(AuthService);
    private http = inject(HttpClient);
    private swPush = inject(SwPush);
    private functions = inject(Functions);
    readonly VAPID_PUBLIC_KEY =
        'BDJF-MunimAEABhe_lVt7Af8T-kfFJs6riCk0FrxQnCJwgKHBehcK7bRXFAzdMmil3xL3IyemOP2P9WzAFKjp1w';

    constructor() {}

    async init() {
        if (Capacitor.isNativePlatform()) {
            await this.requestPermissions();
            await this.createNotificationChannel();
        } else {
            await this.subscribeToPush();
        }
    }

    async subscribeToPush() {
        if (!this.swPush.isEnabled) {
            console.log('Push notifications are not enabled.');
            return;
        }

        try {
            const sub = await this.swPush.requestSubscription({
                serverPublicKey: this.VAPID_PUBLIC_KEY,
            });

            // Save the subscription to Pocketbase
            await this.auth.client.collection('push_subscriptions').create({
                user: this.auth.currentUserId,
                subscription: sub.toJSON(),
            });

            console.log('Push subscription successful and saved to Pocketbase:', sub);
        } catch (err) {
            console.error('Could not subscribe to push notifications', err);
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

    async scheduleTurnNotification(delayInSeconds: number = 0, opponentId?: string) {
        if (Capacitor.isNativePlatform()) {
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
        } else {
            // For web, trigger the cloud function if we have an opponent ID
            if (opponentId) {
                this.sendTurnNotification(opponentId);
            }
        }
    }

    sendTurnNotification(opponentId: string) {
        console.log(`Calling cloud function to notify opponent: ${opponentId}`);
        const sendNotificationFn = httpsCallable(this.functions, 'sendTurnNotification');
        sendNotificationFn({ opponentId })
            .then((result) => {
                console.log('Cloud function called successfully', result);
            })
            .catch((error) => {
                console.error('Error calling cloud function:', error);
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
