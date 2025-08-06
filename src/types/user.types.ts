/**
 * User-related type definitions
 */

/**
 * User information interface
 */
export interface UserInfo {
  userId: string;
  username: string;
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
 * User profile information
 */
export interface UserProfile {
  userId: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  lastLoginAt: Date;
}
