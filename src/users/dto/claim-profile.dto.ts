import { IsNotEmpty, IsString } from 'class-validator';

export class ClaimProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'Mã nhân viên (Employee Code) không được để trống' })
  employeeCode!: string;
}
