import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { RoomService } from '../services/room.service';

@Injectable()
export class RoomAccessGuard implements CanActivate {
  constructor(private readonly roomService: RoomService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const roomId = client.handshake.query?.roomId as string;

    if (!roomId) {
      throw new WsException('Room ID is required');
    }

    if (!this.roomService.isUserInRoom(roomId, client.id)) {
      throw new WsException('User is not in the room');
    }

    return true;
  }
}
