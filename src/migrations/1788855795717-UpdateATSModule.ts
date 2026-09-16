import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateATSModule1788855795717 implements MigrationInterface {
    name = 'UpdateATSModule1788855795717'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "deadline" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "level" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "job_type" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "working_model" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "location" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "working_hours" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "experience_years" double precision`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "education_level" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "gender" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "age_range" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "must_have_skills" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "nice_to_have_skills" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD "languages" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "public_salary_display" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "headcount" integer NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "deadline" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "level" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "job_type" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "working_model" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "location" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "working_hours" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "experience_years" double precision`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "education_level" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "gender" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "age_range" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "must_have_skills" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "nice_to_have_skills" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "languages" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "hr_contact_name" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "hr_contact_phone" character varying`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD "hr_contact_email" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "hr_contact_email"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "hr_contact_phone"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "hr_contact_name"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "languages"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "nice_to_have_skills"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "must_have_skills"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "age_range"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "gender"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "education_level"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "experience_years"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "working_hours"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "location"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "working_model"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "job_type"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "level"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "deadline"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "headcount"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP COLUMN "public_salary_display"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "languages"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "nice_to_have_skills"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "must_have_skills"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "age_range"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "gender"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "education_level"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "experience_years"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "working_hours"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "location"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "working_model"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "job_type"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "level"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP COLUMN "deadline"`);
    }

}
