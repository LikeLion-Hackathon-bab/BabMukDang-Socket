import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
@Injectable()
export class AppService {
  constructor(private readonly jwtService: JwtService) {}

  getJWT(username: string, userId: string): string {
    const payload = {
      sub: userId,
      username: username,
      role: 'user',
      email: 'testuser@test.com',
    };
    const token = this.jwtService.sign(payload, { expiresIn: '1h' });
    return token;
  }
}
