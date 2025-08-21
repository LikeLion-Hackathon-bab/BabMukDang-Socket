import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getJWT(
    @Query('username') username: string,
    @Query('userId') userId: string,
  ): string {
    return this.appService.getJWT(username || 'testuser', userId || '1');
  }
}
