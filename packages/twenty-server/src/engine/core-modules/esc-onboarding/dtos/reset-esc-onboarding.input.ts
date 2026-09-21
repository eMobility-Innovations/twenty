import { Field, InputType } from '@nestjs/graphql';

import { IsNotEmpty, IsString } from 'class-validator';

@InputType()
export class ResetEscOnboardingInput {
  // The Keycloak subject of the person to replay. Deliberately not an email —
  // an email identifies the wrong person the day it changes.
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  keycloakSub: string;
}
