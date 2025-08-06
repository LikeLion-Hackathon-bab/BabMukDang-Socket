/**
 * Common type definitions used across the application
 */

/**
 * Generic API response interface
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Pagination interface
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Room state interface
 */
export interface RoomState {
  phase: number;
  phaseData: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
}

/**
 * Permission check result interface
 */
export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Data ownership check result interface
 */
export interface DataOwnershipCheck {
  isOwner: boolean;
  ownerId?: string;
  reason?: string;
}

/**
 * Log level enum
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

/**
 * User role enum
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}
