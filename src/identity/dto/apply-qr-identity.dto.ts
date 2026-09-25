import { IsNotEmpty, IsString } from 'class-validator';

export class ApplyQrIdentityDto {
  @IsNotEmpty({ message: 'Chuỗi mã QR không được để trống.' })
  @IsString()
  rawQrString!: string;
}
