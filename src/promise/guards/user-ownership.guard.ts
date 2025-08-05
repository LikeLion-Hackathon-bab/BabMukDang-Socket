import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { RoomService } from '../services/room.service';

@Injectable()
export class UserOwnershipGuard implements CanActivate {
  constructor(private readonly roomService: RoomService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const data = context.switchToWs().getData();
    const userId = data?.userId;

    if (!userId) {
      throw new WsException('User ID is required');
    }

    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) {
      throw new WsException('User is not in any room');
    }

    const room = this.roomService.createOrGetRoom(roomId);
    const userInfo = room.users.get(client.id);

    if (!userInfo) {
      throw new WsException('User not found in room');
    }

    if (userInfo.userId !== userId) {
      throw new WsException('User can only modify their own data');
    }

    return true;
  }
}
