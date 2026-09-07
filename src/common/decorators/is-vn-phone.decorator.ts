// src/common/decorators/is-vn-phone.decorator.ts
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { getVnNetworkProvider } from '../utils/phone.util';

@ValidatorConstraint({ async: false })
export class IsVnPhoneConstraint implements ValidatorConstraintInterface {
  validate(phone: any) {
    if (typeof phone !== 'string') return false;
    // Returns true if a provider is found, false if invalid format/prefix
    return getVnNetworkProvider(phone) !== null;
  }

  defaultMessage() {
    return 'Phone number must be a valid Vietnamese mobile number';
  }
}

export function IsVnPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsVnPhoneConstraint,
    });
  };
}
