import { Field, InputType } from '@nestjs/graphql';

import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class AdvanceEscOnboardingStepInput {
  // The step the user has just finished. Free text so a script can be edited
  // without a schema change; length-capped so it cannot be used as a store.
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  completedStep: string;

  // The step to resume on. Absent on the LAST step of a script, which is why
  // @IsOptional() is load-bearing: class-validator runs @IsString() against
  // `undefined` without it, so the final advance of every wizard run would be
  // rejected with a validation error.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  nextStep?: string;
}
