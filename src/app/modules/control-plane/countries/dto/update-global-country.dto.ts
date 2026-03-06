import { PartialType } from '@nestjs/swagger';
import { CreateGlobalCountryDto } from './create-global-country.dto';

export class UpdateGlobalCountryDto extends PartialType(CreateGlobalCountryDto) {}
