import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsLiveStatusToProfile1788746318938 implements MigrationInterface {
    name = 'AddIsLiveStatusToProfile1788746318938'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "is_live" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "is_live"`);
    }

}
