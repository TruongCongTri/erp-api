import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class UpdateFinancialDto {
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu xác nhận.' })
  @IsString()
  passwordConfirm!: string;

  @IsOptional()
  @IsString()
  @Length(10, 13, { message: 'Mã số thuế thường có từ 10 đến 13 ký tự.' })
  taxCode?: string;

  @IsOptional()
  @IsString()
  @Length(10, 10, { message: 'Mã số BHXH tại Việt Nam gồm đúng 10 chữ số.' })
  socialInsuranceNumber?: string;
}
