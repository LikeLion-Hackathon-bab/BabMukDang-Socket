/**
 * Phase-related type definitions
 */

import { UserInfo } from './user.types';

/**
 * Phase change broadcast interface
 */
export interface PhaseChangeBroadcast {
  skip?: UserInfo[];
  prev?: UserInfo[];
  next?: UserInfo[];
}

/**
 * Phase data broadcast payload interface
 */
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

/**
 * Request phase change payload interface
 */
export interface RequestPhaseChangePayload {
  requester: UserInfo;
  targetPhase: number;
}

/**
 * Phase transition result interface
 */
export interface PhaseTransitionResult {
  success: boolean;
  broadcast: PhaseChangeBroadcast;
  message?: string;
}

/**
 * Phase data interface
 */
export interface PhaseData {
  locationSelection?: {
    userId: string;
    nickname: string;
    lat: number;
    lng: number;
  }[];
  recentMenus?: { userId: string; nickname: string; menus: string[] }[];
  wantedMenus?: { userId: string; nickname: string; selectMenu: string }[];
  finalPlace?: { userId: string; nickname: string; selectPlace: string }[];
}
