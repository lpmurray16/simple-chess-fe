import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-message-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-modal.component.html',
  styleUrls: ['./message-modal.component.scss']
})
export class MessageModalComponent {
  @Output() close = new EventEmitter<void>();
  
  messageService = inject(MessageService);
  auth = inject(AuthService);
  
  newMessage = '';

  constructor() {
    this.messageService.markAllAsSeen();
  }

  async send() {
    if (!this.newMessage.trim()) return;
    await this.messageService.sendMessage(this.newMessage);
    this.newMessage = '';
  }

  onClose() {
    this.close.emit();
  }
}
