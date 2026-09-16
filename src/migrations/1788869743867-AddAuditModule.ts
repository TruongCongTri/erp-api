import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuditModule1788869743867 implements MigrationInterface {
    name = 'AddAuditModule1788869743867'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_category_enum" AS ENUM('NAVIGATION', 'CRUD', 'AUTH', 'SYSTEM')`);
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_status_enum" AS ENUM('SUCCESS', 'FAILURE', 'UNAUTHORIZED')`);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" character varying, "userName" character varying, "ipAddress" character varying, "userAgent" text, "category" "public"."audit_logs_category_enum" NOT NULL, "action" character varying NOT NULL, "resource" character varying NOT NULL, "status" "public"."audit_logs_status_enum" NOT NULL, "metadata" jsonb, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_88dcc148d532384790ab874c3d" ON "audit_logs"  ("timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_cfa83f61e4d27a87fcae1e025a" ON "audit_logs"  ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8a0324bcdc1e155445c66213af" ON "audit_logs"  ("category") `);
        await queryRunner.query(`CREATE INDEX "IDX_8769d5d852a6b56dd77186a1c6" ON "audit_logs"  ("resource") `);
        await queryRunner.query(`CREATE INDEX "IDX_2961862b2704794af56359ff0a" ON "audit_logs"  ("status") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_2961862b2704794af56359ff0a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8769d5d852a6b56dd77186a1c6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8a0324bcdc1e155445c66213af"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cfa83f61e4d27a87fcae1e025a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_88dcc148d532384790ab874c3d"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_category_enum"`);
    }

}
