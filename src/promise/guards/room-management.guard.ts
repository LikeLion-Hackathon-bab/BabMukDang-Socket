import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { RoomService } from '../services/room.service';

@Injectable()
export class RoomManagementGuard implements CanActivate {
  constructor(private readonly roomService: RoomService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const data = context.switchToWs().getData();
    const roomId = data?.roomId;
    const userId = data?.userId;

    if (!roomId) {
      throw new WsException('Room ID is required');
    }

    if (!userId) {
      throw new WsException('User ID is required');
    }

    const room = this.roomService.createOrGetRoom(roomId);
    const userInRoom = Array.from(room.users.values()).some(
      (user) => user.userId === userId,
    );

    if (!userInRoom) {
      throw new WsException('User is not in the room');
    }

    return true;
  }
}
