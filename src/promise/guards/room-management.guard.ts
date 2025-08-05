import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { RoomService } from '../services/room.service';

@Injectable()
export class RoomManagementGuard implements CanActivate {
  constructor(private readonly roomService: RoomService) {}

  canActivate(context: ExecutionContext): boolean {
    const data = context.switchToWs().getData();
    const roomId = data?.roomId;
    const userId = data?.userId;

    if (!roomId) {
      throw new WsException('Room ID is required');
    }

    if (!userId) {
      throw new WsException('User ID is required');
    }

    return true;
  }
}
