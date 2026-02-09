import { Injectable } from '@angular/core';
import PocketBase from 'pocketbase';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private pb: PocketBase;
  private currentUserSubject = new BehaviorSubject<any | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private requestLoginSubject = new BehaviorSubject<boolean>(false);
  public requestLogin$ = this.requestLoginSubject.asObservable();

  constructor() {
    this.pb = new PocketBase('https://simple-chess-pb-backend.fly.dev');
    this.pb.autoCancellation(false);
    this.pb.authStore.onChange((token, model) => {
      this.currentUserSubject.next(model);
    });
    // Initialize with current state
    this.currentUserSubject.next(this.pb.authStore.model);
  }

  get client() {
    return this.pb;
  }

  get isValid() {
    return this.pb.authStore.isValid;
  }

  get currentUserId() {
    return this.pb.authStore.model?.id;
  }

  async login(email: string, pass: string) {
    return await this.pb.collection('users').authWithPassword(email, pass);
  }

  async signup(email: string, pass: string) {
    const data = {
      email: email,
      password: pass,
      passwordConfirm: pass,
      name: email.split('@')[0],
    };
    return await this.pb.collection('users').create(data);
  }

  logout() {
    this.pb.authStore.clear();
  }

  requestLogin() {
    this.requestLoginSubject.next(true);
  }
}
