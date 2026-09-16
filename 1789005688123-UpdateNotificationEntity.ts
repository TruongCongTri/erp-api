import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateNotificationEntity1789005688123 implements MigrationInterface {
  name = 'UpdateNotificationEntity1789005688123';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_692a909ee0fa9383e7859f9b406"`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "isRead"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "userId"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "message"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "actionUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "recipient_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "organization_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "department_id" character varying(64) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_category_enum" AS ENUM('TASK', 'APPROVAL', 'SYSTEM', 'ALERT', 'ANNOUNCEMENT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "category" "public"."notifications_category_enum" NOT NULL DEFAULT 'TASK'`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "task_type" character varying(100) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_priority_enum" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "priority" "public"."notifications_priority_enum" NOT NULL DEFAULT 'NORMAL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "task_status" character varying(50)`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_actor_type_enum" AS ENUM('USER', 'SYSTEM_CRON', 'WORKFLOW_ENGINE', 'THIRD_PARTY_WEBHOOK')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "actor_type" "public"."notifications_actor_type_enum" NOT NULL DEFAULT 'SYSTEM_CRON'`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" ADD "actor_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "actor_snapshot" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "body" text NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "i18n_key" character varying(150)`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "i18n_params" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "icon_slug" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "target_entity_type" character varying(100) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "target_entity_id" character varying(100) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "action_url" character varying(500) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "is_read" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "read_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "is_actionable" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_action_state_enum" AS ENUM('NONE', 'PENDING', 'RESOLVED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "action_state" "public"."notifications_action_state_enum" NOT NULL DEFAULT 'NONE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "action_payload" jsonb`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_delivery_channels_enum" AS ENUM('IN_APP', 'PUSH', 'EMAIL', 'ZALO_ZNS')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "delivery_channels" "public"."notifications_delivery_channels_enum" array NOT NULL DEFAULT '{IN_APP}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "is_archived" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "expires_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "title"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "title" character varying(255) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5332a4daa46fd3f4e6625dd275" ON "notifications"  ("recipient_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notif_target" ON "notifications"  ("target_entity_type", "target_entity_id", "recipient_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notif_dept" ON "notifications"  ("recipient_id", "department_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notif_user_unread" ON "notifications"  ("recipient_id", "is_read", "created_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_notif_user_unread"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notif_dept"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notif_target"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5332a4daa46fd3f4e6625dd275"`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "title"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "title" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "expires_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "is_archived"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "delivery_channels"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."notifications_delivery_channels_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "action_payload"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "action_state"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."notifications_action_state_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "is_actionable"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "read_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "is_read"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "action_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "target_entity_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "target_entity_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "icon_slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "i18n_params"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "i18n_key"`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "body"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "actor_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "actor_type"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."notifications_actor_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "task_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "priority"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notifications_priority_enum"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "task_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "category"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notifications_category_enum"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "department_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "organization_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "recipient_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "actionUrl" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "message" character varying NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" ADD "userId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "isRead" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_692a909ee0fa9383e7859f9b406" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
