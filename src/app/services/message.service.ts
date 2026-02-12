import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

export interface Message {
  id: string;
  from_user: string;
  message: string;
  seen: boolean;
  created: string;
  expand?: {
    from_user?: {
      name: string;
      email: string;
    };
  };
}

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private messagesSubject = new BehaviorSubject<Message[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  private hasNewMessagesSubject = new BehaviorSubject<boolean>(false);
  public hasNewMessages$ = this.hasNewMessagesSubject.asObservable();

  constructor(private auth: AuthService) {
    this.auth.currentUser$.subscribe((user) => {
      if (user) {
        this.fetchMessages();
        this.subscribeToMessages();
      } else {
        this.messagesSubject.next([]);
        this.hasNewMessagesSubject.next(false);
        this.auth.client.collection('messages').unsubscribe('*');
      }
    });
  }

  private async fetchMessages() {
    try {
      const records = await this.auth.client.collection('messages').getList(1, 50, {
        sort: '-created',
        expand: 'from_user',
      });

      const messages = records.items as unknown as Message[];
      this.messagesSubject.next(messages);
      this.updateNotificationStatus(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }

  private subscribeToMessages() {
    this.auth.client.collection('messages').subscribe('*', (e) => {
      this.fetchMessages();
    });
  }

  private updateNotificationStatus(messages: Message[]) {
    const currentUserId = this.auth.currentUserId;
    const hasUnread = messages.some((m) => !m.seen && m.from_user !== currentUserId);
    this.hasNewMessagesSubject.next(hasUnread);
  }

  async markAllAsSeen() {
    const currentUserId = this.auth.currentUserId;
    const unreadMessages = this.messagesSubject.value.filter(
      (m) => !m.seen && m.from_user !== currentUserId
    );

    for (const msg of unreadMessages) {
      try {
        await this.auth.client.collection('messages').update(msg.id, { seen: true });
      } catch (error) {
        console.error('Error marking message as seen:', error);
      }
    }
    this.fetchMessages();
  }

  async clearAllMessages() {
    try {
      const records = await this.auth.client.collection('messages').getFullList();
      for (const record of records) {
        await this.auth.client.collection('messages').delete(record.id);
      }
      this.fetchMessages();
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  }

  async sendMessage(text: string) {
    try {
      await this.auth.client.collection('messages').create({
        from_user: this.auth.currentUserId,
        message: text,
        seen: false,
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
}
