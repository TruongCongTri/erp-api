import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class AtsEventsGateway {
  @WebSocketServer()
  server!: Server;

  @OnEvent('ats.upload_progress')
  handleUploadProgress(payload: {
    trackingId: string;
    progress: number;
    status: string;
    result?: any;
  }) {
    // Phát sự kiện đến room hoặc broadcast theo trackingId
    this.server.emit(`cv_progress:${payload.trackingId}`, payload);
  }
}
