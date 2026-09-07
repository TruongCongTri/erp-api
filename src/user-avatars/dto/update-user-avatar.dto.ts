import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class UpdateUserAvatarDto {
  @IsString({ message: 'URL hình ảnh phải là một chuỗi văn bản' })
  @IsNotEmpty({ message: 'URL hình ảnh không được để trống' })
  @IsUrl(
    { require_protocol: true },
    {
      message:
        'Định dạng URL không hợp lệ (phải bắt đầu bằng http:// hoặc https://)',
    },
  )
  imageUrl!: string;
}
