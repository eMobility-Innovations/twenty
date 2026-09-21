import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('EscOnboardingState')
export class EscOnboardingStateDTO {
  // False until the workspace feature flag is turned on. The front renders
  // nothing at all while this is false, which is what keeps the wizard dark
  // for everyone before the rollout.
  @Field(() => Boolean)
  isWizardEnabled: boolean;

  @Field(() => Boolean)
  isOnboarded: boolean;

  @Field(() => String, { nullable: true })
  currentStep: string | null;

  @Field(() => [String])
  completedSteps: string[];

  @Field(() => Int)
  scriptVersion: number;

  // The version the running build expects. A row behind it is replayed.
  @Field(() => Int)
  currentScriptVersion: number;
}
