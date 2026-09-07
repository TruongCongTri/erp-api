import { IsString, IsNotEmpty } from 'class-validator';

export class ParseCccdQrDto {
  @IsString({ message: 'Dữ liệu QR phải là chuỗi văn bản' })
  @IsNotEmpty({ message: 'Dữ liệu QR không được để trống' })
  qrString!: string;
}
