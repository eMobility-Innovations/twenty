import { Field, InputType } from '@nestjs/graphql';

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

@InputType()
export class AdvanceEscOnboardingStepInput {
  // The step the user has just finished. Free text so a script can be edited
  // without a schema change; length-capped so it cannot be used as a store.
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  completedStep: string;

  @Field(() => String, { nullable: true })
  @IsString()
  @MaxLength(128)
  nextStep?: string;
}
