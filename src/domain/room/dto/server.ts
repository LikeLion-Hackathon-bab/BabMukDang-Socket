import { IsArray, IsNotEmpty, IsObject, IsString } from 'class-validator';
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
  locationDetail: {
    placeName: string;
    placeAddress: string;
    lat: number;
    lng: number;
  };
  @IsObject()
  @IsNotEmpty()
  restaurant: RestaurantInfo;
}
export class InvitationResultRequestDto {
  @IsObject()
  @IsNotEmpty()
  locationDetail: {
    placeName: string;
    placeAddress: string;
    lat: number;
    lng: number;
  };
  @IsObject()
  @IsNotEmpty()
  restaurant: RestaurantInfo;
  @IsString()
  @IsNotEmpty()
  meetingAt: string;
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
