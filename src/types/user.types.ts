/**
 * User-related type definitions
 */

/**
 * User information interface
 */
export interface UserInfo {
  userId: string;
  nickname: string;
  email: string;
  role: string;
}

/**
 * JWT payload interface
 */
export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  username: string;
  email: string;
  role: string;
}

/**
 * User credentials for authentication
 */
export interface UserCredentials {
  email: string;
  password: string;
}

/**
 * User profile information
 */
export interface UserProfile {
  userId: string;
  nickname: string;
  email: string;
  role: string;
  createdAt: Date;
  lastLoginAt: Date;
}
