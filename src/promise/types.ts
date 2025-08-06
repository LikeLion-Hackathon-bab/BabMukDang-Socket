export interface UserInfo {
  userId: string;
  nickname: string;
  email: string;
  role: string;
}
export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  username: string;
  email: string;
  role: string;
}
export interface ChatMessage {
  senderId: string;
  nickname: string;
  message: string;
  timestamp: number;
  phase: number;
}

export interface PhaseChangeBroadcast {
  skip?: UserInfo[];
  prev?: UserInfo[];
  next?: UserInfo[];
}

export interface PhaseDataBroadcastPayload {
  phase: number;
  data: {
    locationSelection?: {
      userId: string;
      nickname: string;
      lat: number;
      lng: number;
    }[];
    recentMenus?: { userId: string; nickname: string; menus: string[] }[];
    wantedMenus?: { userId: string; nickname: string; selectMenu: string }[];
    finalPlace?: { userId: string; nickname: string; selectPlace: string }[];
  };
}

export interface JoinRoomPayload {
  userId: string;
  nickname: string;
  roomId: string;
}

export interface LeaveRoomPayload {
  userId: string;
  nickname: string;
  roomId: string;
}

export interface RequestPhaseChangePayload {
  requester: UserInfo;
  targetPhase: number;
}
