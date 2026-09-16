import { MigrationInterface, QueryRunner } from "typeorm";

export class AddATSModule1788757432755 implements MigrationInterface {
    name = 'AddATSModule1788757432755'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ats_candidate_profiles" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "full_name" character varying NOT NULL, "email" character varying NOT NULL, "phone_number" character varying(15), "linkedin_url" character varying, "cv_references" jsonb, CONSTRAINT "UQ_d6d1e486bb77b12ba412679ea90" UNIQUE ("email"), CONSTRAINT "PK_ef90f7c8a046f1b8f6758d84643" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."ats_recruitment_requests_status_enum" AS ENUM('DRAFT', 'PENDING_HR', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "ats_recruitment_requests" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "job_title" character varying NOT NULL, "department" character varying NOT NULL, "headcount" integer NOT NULL DEFAULT '1', "target_salary_min" numeric(15,2), "target_salary_max" numeric(15,2), "raw_requirements" text NOT NULL, "reason_for_hiring" text NOT NULL, "status" "public"."ats_recruitment_requests_status_enum" NOT NULL DEFAULT 'DRAFT', "requester_id" uuid, CONSTRAINT "PK_ab196fa3047eddc4dcb888b66c1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."ats_job_posts_status_enum" AS ENUM('DRAFT', 'PUBLISHED', 'CLOSED')`);
        await queryRunner.query(`CREATE TABLE "ats_job_posts" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "public_title" character varying NOT NULL, "ai_drafted_description" text NOT NULL, "company_benefits" text NOT NULL, "status" "public"."ats_job_posts_status_enum" NOT NULL DEFAULT 'DRAFT', "external_mapping" jsonb NOT NULL DEFAULT '{}', "request_id" uuid, CONSTRAINT "REL_284054e4b134a2a3c48516f847" UNIQUE ("request_id"), CONSTRAINT "PK_d20d95e179113c0eb2333e50e17" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."ats_job_applications_status_enum" AS ENUM('NEW', 'AI_SCREENING', 'HR_SCREENING', 'INTERVIEW', 'OFFERED', 'BACKUP', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "ats_job_applications" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" "public"."ats_job_applications_status_enum" NOT NULL DEFAULT 'NEW', "ai_score" integer, "ai_reasoning" text, "referred_by_id" uuid, "candidate_id" uuid, "job_post_id" uuid, CONSTRAINT "UQ_candidate_job" UNIQUE ("candidate_id", "job_post_id"), CONSTRAINT "PK_924ec85dd7dfa95dc1808912ca9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ats_application_submissions" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "platform_source" character varying NOT NULL, "external_application_id" character varying, "cv_url" text, "cv_file_key" character varying, "cover_letter" text, "application_id" uuid, CONSTRAINT "PK_a51ec50775f7da9cd7c41f7685e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" ADD CONSTRAINT "FK_645ef6173bffa10973355b4162b" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" ADD CONSTRAINT "FK_284054e4b134a2a3c48516f847d" FOREIGN KEY ("request_id") REFERENCES "ats_recruitment_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ats_job_applications" ADD CONSTRAINT "FK_bc7054d43edbac609712febe905" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ats_job_applications" ADD CONSTRAINT "FK_0399d6a3b48981aff70232ad776" FOREIGN KEY ("candidate_id") REFERENCES "ats_candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ats_job_applications" ADD CONSTRAINT "FK_fe44928a982f1cdb4e9aa135650" FOREIGN KEY ("job_post_id") REFERENCES "ats_job_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ats_application_submissions" ADD CONSTRAINT "FK_46ebf1c00b31c070f1f270e822f" FOREIGN KEY ("application_id") REFERENCES "ats_job_applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ats_application_submissions" DROP CONSTRAINT "FK_46ebf1c00b31c070f1f270e822f"`);
        await queryRunner.query(`ALTER TABLE "ats_job_applications" DROP CONSTRAINT "FK_fe44928a982f1cdb4e9aa135650"`);
        await queryRunner.query(`ALTER TABLE "ats_job_applications" DROP CONSTRAINT "FK_0399d6a3b48981aff70232ad776"`);
        await queryRunner.query(`ALTER TABLE "ats_job_applications" DROP CONSTRAINT "FK_bc7054d43edbac609712febe905"`);
        await queryRunner.query(`ALTER TABLE "ats_job_posts" DROP CONSTRAINT "FK_284054e4b134a2a3c48516f847d"`);
        await queryRunner.query(`ALTER TABLE "ats_recruitment_requests" DROP CONSTRAINT "FK_645ef6173bffa10973355b4162b"`);
        await queryRunner.query(`DROP TABLE "ats_application_submissions"`);
        await queryRunner.query(`DROP TABLE "ats_job_applications"`);
        await queryRunner.query(`DROP TYPE "public"."ats_job_applications_status_enum"`);
        await queryRunner.query(`DROP TABLE "ats_job_posts"`);
        await queryRunner.query(`DROP TYPE "public"."ats_job_posts_status_enum"`);
        await queryRunner.query(`DROP TABLE "ats_recruitment_requests"`);
        await queryRunner.query(`DROP TYPE "public"."ats_recruitment_requests_status_enum"`);
        await queryRunner.query(`DROP TABLE "ats_candidate_profiles"`);
    }

}
