import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class VerifyEmailDto {
  @IsUUID('all', { message: 'ID người dùng không hợp lệ' })
  @IsNotEmpty({ message: 'ID người dùng không được để trống' })
  userId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Mã xác thực không được để trống' })
  token!: string;
}
