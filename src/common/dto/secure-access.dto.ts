import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class SecureAccessDto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu xác nhận không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password!: string;
}
