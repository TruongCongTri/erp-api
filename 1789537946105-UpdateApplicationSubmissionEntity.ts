import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateApplicationSubmissionEntity1789537946105 implements MigrationInterface {
    name = 'UpdateApplicationSubmissionEntity1789537946105'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "application_submissions" ADD "ai_score" smallint`);
        await queryRunner.query(`ALTER TABLE "application_submissions" ADD "ai_reasoning" text`);
        await queryRunner.query(`ALTER TABLE "application_submissions" ADD "ai_tier" character varying(30)`);
        await queryRunner.query(`ALTER TABLE "application_submissions" ADD "is_cv_purged" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "application_submissions" DROP COLUMN "is_cv_purged"`);
        await queryRunner.query(`ALTER TABLE "application_submissions" DROP COLUMN "ai_tier"`);
        await queryRunner.query(`ALTER TABLE "application_submissions" DROP COLUMN "ai_reasoning"`);
        await queryRunner.query(`ALTER TABLE "application_submissions" DROP COLUMN "ai_score"`);
    }

}
