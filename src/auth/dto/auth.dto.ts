import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  Length,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}

export class GoogleLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  picture?: string;

  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsEnum(['email', 'zalo'])
  channel!: 'email' | 'zalo';
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString({ message: 'OTP phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Vui lòng nhập mã OTP.' })
  @Length(6, 6, { message: 'Mã OTP phải có đúng 6 chữ số.' })
  otp!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword?: string;

  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @MinLength(6, { message: 'Mật khẩu mới phải có tối thiểu 6 ký tự' })
  newPassword!: string;
}

export class SendOtpDto {
  @IsEnum(['email', 'zalo'])
  channel!: 'email' | 'zalo';
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  otp!: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  sessionId: string;
  deviceInfo: string;
  rememberMe?: boolean;
}

export interface ActiveSession {
  sessionId: string;
  deviceInfo: string;
  rememberMe: boolean;
  lastAccessed: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken!: string;
}
