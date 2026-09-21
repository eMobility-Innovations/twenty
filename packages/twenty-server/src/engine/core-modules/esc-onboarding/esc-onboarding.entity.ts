import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

// The wizard is keyed on the Keycloak `sub`, never on email: the
// @remotecrew.co.uk -> @rc.fiszu.com contractor migration proved an email join
// silently orphans a person the day their address changes.
@Entity({ name: 'escOnboarding', schema: 'core' })
@Index('IDX_ESC_ONBOARDING_USER_ID_UNIQUE', ['userId'], { unique: true })
export class EscOnboardingEntity {
  @PrimaryColumn({ type: 'text' })
  keycloakSub: string;

  // The join key for an authenticated request, which carries a Twenty user id
  // rather than the identity-provider subject.
  @Column({ type: 'uuid', nullable: false })
  userId: string;

  // Display label only. Never joined on — see the class comment.
  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'boolean', nullable: false, default: false })
  isOnboarded: boolean;

  @Column({ type: 'text', nullable: true })
  currentStep: string | null;

  @Column({ type: 'jsonb', nullable: false, default: () => "'[]'::jsonb" })
  completedSteps: string[];

  @Column({ type: 'integer', nullable: false, default: 1 })
  scriptVersion: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
