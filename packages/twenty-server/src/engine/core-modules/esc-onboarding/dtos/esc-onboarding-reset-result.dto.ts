import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('EscOnboardingResetResult')
export class EscOnboardingResetResultDTO {
  @Field(() => Int)
  resetCount: number;
}
