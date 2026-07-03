import { PartialType } from '@nestjs/swagger';
import { CreatePlanDto } from './create-plan.dto';

// Every field optional. A field left out is unchanged; sending null on a limit means "unlimited".
export class UpdatePlanDto extends PartialType(CreatePlanDto) {}
