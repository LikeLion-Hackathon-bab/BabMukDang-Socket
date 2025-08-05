import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { UserInfo } from '../types';

@Injectable()
export class UserInfoValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata): UserInfo {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('Invalid user information');
    }

    const { userId, nickname } = value;

    if (!userId || typeof userId !== 'string') {
      throw new BadRequestException('User ID is required and must be a string');
    }

    if (!nickname || typeof nickname !== 'string') {
      throw new BadRequestException(
        'Nickname is required and must be a string',
      );
    }

    if (nickname.length < 1 || nickname.length > 20) {
      throw new BadRequestException(
        'Nickname must be between 1 and 20 characters',
      );
    }

    return { userId, nickname };
  }
}

@Injectable()
export class RoomIdValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata): string {
    if (!value || typeof value !== 'string' || value.length === 0) {
      throw new BadRequestException(
        'Room ID is required and must be a non-empty string',
      );
    }

    return value;
  }
}

@Injectable()
export class PhaseDataValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata): any {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('Phase data must be an object');
    }

    // 각 필드에 대해 userId 소유권 검사
    const fields = [
      'locationSelection',
      'recentMenus',
      'wantedMenus',
      'finalPlace',
    ];

    for (const field of fields) {
      if (value[field] && Array.isArray(value[field])) {
        for (const item of value[field]) {
          if (item && typeof item === 'object' && item.userId) {
            // userId 필드가 있는지 확인 (소유권 검사는 Guard에서 처리)
            if (typeof item.userId !== 'string') {
              throw new BadRequestException(
                `${field} items must have valid userId`,
              );
            }
          }
        }
      }
    }

    return value;
  }
}
