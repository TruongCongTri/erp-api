import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAIDraftToEntity1788758993925 implements MigrationInterface {
    name = 'AddAIDraftToEntity1788758993925'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "company_benefits" text`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "ai_drafted_description" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "ai_drafted_description"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "company_benefits"`);
    }

}
