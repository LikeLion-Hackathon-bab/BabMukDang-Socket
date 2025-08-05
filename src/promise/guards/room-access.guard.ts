import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { RoomService } from '../services/room.service';
import { ExtendedSocket } from '../types/socket.types';

@Injectable()
export class RoomAccessGuard implements CanActivate {
  constructor(private readonly roomService: RoomService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: ExtendedSocket = context.switchToWs().getClient();
    const roomId = client.handshake.query?.roomId as string;

    if (!roomId) {
      throw new WsException('Room ID is required');
    }

    // socket.data에서 roomId 확인
    const userRoomId = client.data.roomId;
    if (userRoomId !== roomId) {
      throw new WsException('User is not in the room');
    }

    return true;
  }
}
