import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsUrl,
  IsArray,
  ArrayMinSize,
  IsObject,
} from 'class-validator';

export class CreateFacebookAccountDto {
  @IsString()
  @IsNotEmpty()
  accountName!: string;

  @IsString()
  @IsNotEmpty()
  accountIdentifier!: string;

  // Raw session cookies as captured from the browser (Puppeteer/DevTools CookieParam[] shape).
  // The service encrypts this before persisting; it is never stored or returned in plaintext.
  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  cookies!: Record<string, unknown>[];

  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  proxyUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyPostLimit?: number;
}
