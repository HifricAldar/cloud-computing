import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { UserService } from '../service/user.service';
import { JwtAuthGuard } from '../../guards/jwt.guard';
import { RegisterUserDto } from '../dto/register_user.dto';
import { User } from '../entity/user.entity';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Post('register')
  async registerUser(@Body() request: RegisterUserDto) {
    return this.userService.createUser(request);
  }
  @Get('email/:email')
  @UseGuards(JwtAuthGuard) // Mengamankan rute dengan JWT Guard
  async getUserByEmail(
    @Param('email') email: string,
    @Req() req: any,
  ): Promise<User> {
    try {
      const authenticatedUserEmail = req.user.email;
      if (authenticatedUserEmail !== email) {
        throw new ForbiddenException('You are not allowed');
      }
      return await this.userService.getUserByEmail(email);
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }
}
