import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
@Injectable()
export class AppService {
  constructor(private readonly jwtService: JwtService) {}

  getJWT(): string {
    const payload = {
      userId: 1,
      username: 'testuser',
      role: 'user',
      email: 'testuser@test.com',
    };
    const token = this.jwtService.sign(payload, { expiresIn: '1h' });
    return token;
  }
}
