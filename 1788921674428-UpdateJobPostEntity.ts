import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateJobPostEntity1788921674428 implements MigrationInterface {
  name = 'UpdateJobPostEntity1788921674428';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ats_job_posts" ADD "scheduled_publish_time" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ats_job_posts" DROP COLUMN "scheduled_publish_time"`,
    );
  }
}
