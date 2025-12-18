import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  ParticipantDto,
  RecentMenuDto,
  AuthorDto,
} from 'src/domain/common/dto';

/**
 * Spring 서버 → WebSocket 서버: Announcement 방 생성 요청
 * Spring WebSocketRequestDto와 매핑
 */
export class AnnouncementRequestDto {
  @IsString()
  @IsNotEmpty()
  announcementId: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsNotEmpty()
  meetingAt: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  participants: ParticipantDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecentMenuDto)
  recentMenu: RecentMenuDto[];
}

/**
 * Spring 서버 → WebSocket 서버: Invitation 방 생성 요청
 * Spring InvitationSocketRequestDto와 매핑
 */
export class InvitationRequestDto {
  @IsString()
  @IsNotEmpty()
  invitationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  participants: ParticipantDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecentMenuDto)
  recentMenu: RecentMenuDto[];
}

/**
 * WebSocket 서버 → Spring 서버: Announcement 결과 전송
 * Spring PlanDtos.CreateRequest와 매핑
 * 날짜 형식: yyyy-MM-dd, 시간 형식: HH:mm
 */
export class AnnouncementResultRequestDto {
  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsNotEmpty()
  meetingDate: string; // yyyy-MM-dd format

  @IsString()
  @IsNotEmpty()
  meetingTime: string; // HH:mm format

  @ValidateNested()
  @Type(() => AuthorDto)
  author: AuthorDto;
}

/**
 * WebSocket 서버 → Spring 서버: Invitation 결과 전송
 * Spring PlanDtos.CreateRequest와 매핑
 * 날짜 형식: yyyy-MM-dd, 시간 형식: HH:mm
 */
export class InvitationResultRequestDto {
  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsNotEmpty()
  meetingDate: string; // yyyy-MM-dd format

  @IsString()
  @IsNotEmpty()
  meetingTime: string; // HH:mm format

  @ValidateNested()
  @Type(() => AuthorDto)
  author: AuthorDto;
}

/**
 * 레스토랑 정보 (Kakao API 기반)
 */
export interface RestaurantInfo {
  placeId: string;
  placeName: string;
  addressName: string;
  roadAddressName: string;
  phoneNumber: string;
  placeUrl: string;
  categoryGroupCode: string;
  categoryGroupName: string;
  categoryName: string;
  x: number;
  y: number;
}
