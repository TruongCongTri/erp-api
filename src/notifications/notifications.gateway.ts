import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { JwtPayload } from 'src/auth/dto/auth.dto';

@WebSocketGateway({
  cors: { origin: '*' }, // Configure securely for your FE domain in production
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket): void {
    try {
      const auth = client.handshake.auth as Record<string, unknown>;

      // Extract JWT from the frontend connection handshake
      const token =
        (typeof auth.token === 'string' ? auth.token : undefined) ||
        client.handshake.headers['authorization'];

      // Ensure the token is actually a string before proceeding
      if (typeof token !== 'string') {
        throw new Error('No valid token provided');
      }

      // Verify and decode
      const cleanToken = token.replace('Bearer ', '');
      const payload = this.jwtService.verify<JwtPayload>(cleanToken);

      // Join a private room specific to this user ID
      const userRoom = `user_${payload.sub}`;
      void client.join(userRoom);

      this.logger.debug(`Client connected and joined ${userRoom}`);
    } catch (_error) {
      this.logger.error('WebSocket Authentication failed');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  // Helper method to push to a specific user
  pushToUser(userId: string, payload: unknown) {
    this.server.to(`user_${userId}`).emit('notification', payload);
  }

  // Generic method for system/UI updates
  emitSystemEventToUser(userId: string, eventName: string, payload?: unknown) {
    this.server.to(`user_${userId}`).emit(eventName, payload);
  }
}
