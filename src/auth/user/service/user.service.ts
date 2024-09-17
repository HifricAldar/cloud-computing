import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { RegisterUserDto } from '../dto/register_user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../entity/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Address } from '../entity/address.entity';
import { OtpService } from './otp.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UserService {
  constructor(
    private otpService: OtpService,
    private jwtService: JwtService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
  ) {}

  async createUser(
    request: RegisterUserDto,
  ): Promise<{ access_token: string }> {
    // Validasi request sebelum membuat user
    await this.validateCreateUserRequest(request);

    // Membuat instance user baru
    const user = this.userRepository.create({
      ...request,
      password: await bcrypt.hash(request.password, 10),
    });

    // Simpan user ke database
    const saveUser = await this.userRepository.save(user);

    // Buat OTP untuk user
    await this.otpService.generateOtp(saveUser.id);

    // Jangan return password dalam response
    delete user.password;

    // Generate JWT token untuk user yang baru dibuat
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);

    // Kembalikan JWT token
    return { access_token };
  }

  async getUserByEmail(email: string): Promise<User> {
    // Cari user berdasarkan email
    const user = await this.userRepository.findOne({
      where: { email },
    });

    // Jika user tidak ditemukan
    if (!user) {
      throw new UnprocessableEntityException('User not found.');
    }

    // Pisahkan password sebelum mengembalikan user
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;

    // Kembalikan user tanpa password
    return userWithoutPassword as User;
  }

  private async validateCreateUserRequest(request: RegisterUserDto) {
    let user: User;

    try {
      user = await this.userRepository.findOne({
        where: { email: request.email },
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // Log error jika perlu
    }

    if (user) {
      throw new UnprocessableEntityException('Email already exists.');
    }
  }
}
