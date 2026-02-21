import { AuthService } from './auth.service';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, Channel, PermissionStatus } from '@capacitor/local-notifications';
import {
    PushNotifications,
    Token,
    PushNotificationSchema,
    ActionPerformed,
} from '@capacitor/push-notifications';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class NotificationService {
    private http = inject(HttpClient);
    private swPush = inject(SwPush);
    readonly VAPID_PUBLIC_KEY =
        'BDJF-MunimAEABhe_lVt7Af8T-kfFJs6riCk0FrxQnCJwgKHBehcK7bRXFAzdMmil3xL3IyemOP2P9WzAFKjp1w';

    constructor(private auth: AuthService) {}

    async init() {
        if (Capacitor.isNativePlatform()) {
            // Native platform logic
            await this.registerNativePush();
        } else {
            // Web platform logic
            await this.subscribeToPush();
        }
    }

    // Web Push Subscription
    async subscribeToPush() {
        if (!this.swPush.isEnabled) {
            console.log('Push notifications are not enabled for web.');
            return;
        }
        try {
            const sub = await this.swPush.requestSubscription({
                serverPublicKey: this.VAPID_PUBLIC_KEY,
            });
            console.log('Saving web push subscription to Pocketbase...');
            await this.auth.client.collection('push_subscriptions').create({
                user: this.auth.currentUserId,
                subscription: sub.toJSON(), // Save the whole subscription object
            });
            console.log('Web push subscription successful and saved.');
        } catch (err) {
            console.error('Could not subscribe to web push notifications', err);
        }
    }

    // Native Push Registration
    async registerNativePush() {
        console.log('Initializing native push notifications...');
        // Request permission to use push notifications
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            throw new Error('User denied permissions!');
        }

        // Register with FCM and get the token
        await PushNotifications.register();

        // On success, we should be able to receive notifications
        PushNotifications.addListener('registration', async (token: Token) => {
            console.log('Push registration success, token: ' + token.value);
            console.log('Saving FCM token to Pocketbase...');
            // Save the FCM token to our backend
            await this.auth.client.collection('push_subscriptions').create({
                user: this.auth.currentUserId,
                subscription: token.value, // Save the token string
            });
            console.log('FCM token saved.');
        });

        // Some issue with our setup and push will not work
        PushNotifications.addListener('registrationError', (error: any) => {
            console.error('Error on registration: ' + JSON.stringify(error));
        });

        // Show us the notification payload if the app is open on our device
        PushNotifications.addListener(
            'pushNotificationReceived',
            (notification: PushNotificationSchema) => {
                console.log('Push received: ' + JSON.stringify(notification));
            },
        );

        // Method called when tapping on a notification
        PushNotifications.addListener(
            'pushNotificationActionPerformed',
            (notification: ActionPerformed) => {
                console.log('Push action performed: ' + JSON.stringify(notification));
            },
        );
    }

    async sendTurnNotification(opponentId: string) {
        console.log(`Calling cloud function to notify opponent: ${opponentId}`);
        try {
            const user = this.auth.client.authStore.model;
            if (!user) {
                throw new Error('User not authenticated');
            }
            // For public functions, we no longer need to send an auth token
            // const token = this.auth.client.authStore.token;

            const functionUrl = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/sendTurnNotification`;

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: { opponentId } }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error calling cloud function:', errorData);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Cloud function called successfully', result);
        } catch (error) {
            console.error('Error calling cloud function via fetch:', error);
        }
    }

    // The local notification methods are not needed for push, but we can keep them
    async requestPermissions(): Promise<boolean> {
        const result: PermissionStatus = await LocalNotifications.requestPermissions();
        return result.display === 'granted';
    }

    async createNotificationChannel() {
        if (Capacitor.getPlatform() === 'android') {
            const channel: Channel = {
                id: 'game_updates',
                name: 'Game Updates',
                description: 'Notifications for game events like player turns',
                importance: 4,
                visibility: 1,
                vibration: true,
            };
            await LocalNotifications.createChannel(channel);
        }
    }
}
