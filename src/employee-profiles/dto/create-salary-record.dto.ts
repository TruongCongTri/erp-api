import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSalaryRecordDto {
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu xác nhận.' })
  @IsString()
  passwordConfirm!: string;

  @IsNotEmpty({ message: 'Mức lương cơ bản không được để trống.' })
  @IsNumber({}, { message: 'Mức lương cơ bản phải là chữ số.' })
  @Min(0, { message: 'Mức lương cơ bản không thể âm.' })
  baseSalary!: number;

  @IsOptional()
  @IsNumber({}, { message: 'Mức phụ cấp phải là chữ số.' })
  @Min(0, { message: 'Mức phụ cấp không thể âm.' })
  extraSalary?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsNotEmpty({ message: 'Ngày hiệu lực không được để trống.' })
  @IsDateString(
    {},
    { message: 'Ngày hiệu lực phải đúng định dạng ISO (YYYY-MM-DD).' },
  )
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
