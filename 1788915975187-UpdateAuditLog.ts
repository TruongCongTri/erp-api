import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateAuditLog1788915975187 implements MigrationInterface {
  name = 'UpdateAuditLog1788915975187';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cfa83f61e4d27a87fcae1e025a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8a0324bcdc1e155445c66213af"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8769d5d852a6b56dd77186a1c6"`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "category"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_category_enum"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "userId"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "userName"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "resource"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "timestampMs" bigint NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "actorId" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "actor" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "actorRole" character varying`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD "actorAvatar" text`);
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_module_enum" AS ENUM('hr', 'recruitment', 'approval', 'auth', 'admin', 'payroll', 'employee')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "module" "public"."audit_logs_module_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "target" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "targetId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "description" text NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD "changes" jsonb`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "action"`);
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('create', 'update', 'delete', 'approve', 'reject', 'login', 'logout', 'view', 'export')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "action" "public"."audit_logs_action_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_status_enum" ADD VALUE 'WARNING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2dc33f7f3c22e2e7badafca1d1" ON "audit_logs"  ("actorId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON "audit_logs"  ("action") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aca9ec48e47f56efca7d45898d" ON "audit_logs"  ("module") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fcfb9137823075fb3162b82f73" ON "audit_logs"  ("targetId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fcfb9137823075fb3162b82f73"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aca9ec48e47f56efca7d45898d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cee5459245f652b75eb2759b4c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2dc33f7f3c22e2e7badafca1d1"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_status_enum_old" AS ENUM('SUCCESS', 'FAILURE', 'UNAUTHORIZED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "status" TYPE "public"."audit_logs_status_enum_old" USING "status"::"text"::"public"."audit_logs_status_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."audit_logs_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_status_enum_old" RENAME TO "audit_logs_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "action"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "action" character varying NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "changes"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN "description"`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "targetId"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "target"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "module"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_module_enum"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN "actorAvatar"`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "actorRole"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "actor"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "actorId"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN "timestampMs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "resource" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "userName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "userId" character varying`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_category_enum" AS ENUM('NAVIGATION', 'CRUD', 'AUTH', 'SYSTEM')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "category" "public"."audit_logs_category_enum" NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8769d5d852a6b56dd77186a1c6" ON "audit_logs" USING btree ("resource") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8a0324bcdc1e155445c66213af" ON "audit_logs" USING btree ("category") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cfa83f61e4d27a87fcae1e025a" ON "audit_logs" USING btree ("userId") `,
    );
  }
}
