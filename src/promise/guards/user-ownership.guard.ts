import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { RoomService } from '../services/room.service';
import { ExtendedSocket, MessageData } from '../../types/socket.types';

@Injectable()
export class UserOwnershipGuard implements CanActivate {
  constructor(private readonly roomService: RoomService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: ExtendedSocket = context.switchToWs().getClient();
    const data: MessageData = context.switchToWs().getData();
    const userId = data?.userId;

    if (!userId) {
      throw new WsException('User ID is required');
    }

    const userInfo = client.data.userInfo;
    if (!userInfo) {
      throw new WsException('User is not in any room');
    }

    if (userInfo.userId !== userId) {
      throw new WsException('User can only modify their own data');
    }

    return true;
  }
}
