import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MenuRecommendation } from 'src/domain/menu/types/menu.type';

//스프링 서버에서 사용하는 DTO
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
  @IsNotEmpty()
  participants: [
    {
      userId: string;
      userName: string;
      userProfileImageURL: string;
    },
  ];
  @IsArray()
  @IsNotEmpty()
  recentMenu: [
    {
      userId: string;
      menu: MenuRecommendation[];
    },
  ];
}
export class InvitationRequestDto {
  @IsString()
  @IsNotEmpty()
  invitationId: string;
  @IsArray()
  @IsNotEmpty()
  participants: [
    {
      userId: string;
      username: string;
      userProfileImageURL: string;
    },
  ];
  // participantNames: string[];
  @IsArray()
  @IsNotEmpty()
  recentMenu: [
    {
      userId: string;
      menu: MenuRecommendation[];
    },
  ];
}
export class AnnouncementResultRequestDto {
  @IsObject()
  @IsNotEmpty()
  location: string;
  @IsString()
  @IsNotEmpty()
  meetingDate: string;
  @IsString()
  @IsNotEmpty()
  meetingTime: string;
  @IsString()
  @IsNotEmpty()
  author: {
    name: string;
  };
}
export class InvitationResultRequestDto {
  @IsObject()
  @IsNotEmpty()
  location: string;
  @IsString()
  @IsNotEmpty()
  meetingDate: string;
  @IsString()
  @IsNotEmpty()
  meetingTime: string;
  @IsString()
  @IsNotEmpty()
  author: {
    name: string;
  };
}

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

/** Spring → Socket 참여 취소 알림 (contracts/participation-cancel.md §3) */
export class LeaveRoomDto {
  // 계약은 문자열이지만 숫자로 와도 받는다(방 생성 participants[].userId 와 같은 문자열로 맞춤)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsBoolean()
  dissolve?: boolean;
}
