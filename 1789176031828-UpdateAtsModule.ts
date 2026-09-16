import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateAtsModule1789176031828 implements MigrationInterface {
    name = 'UpdateAtsModule1789176031828'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "candidate_profiles" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "full_name" character varying(150) NOT NULL, "email" character varying(150) NOT NULL, "phone_number" character varying(30) NOT NULL, "linkedin_url" character varying(255), "portfolio_url" character varying(255), CONSTRAINT "PK_8e8cf5b54118601673585218cc4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_candidates_phone" ON "candidate_profiles"  ("phone_number") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_candidates_email" ON "candidate_profiles"  ("email") `);
        await queryRunner.query(`CREATE TYPE "public"."recruitment_requests_status_enum" AS ENUM('PENDING_HR', 'DRAFTED', 'PENDING_HEAD_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "recruitment_requests" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "request_code" character varying(32) NOT NULL, "raw_request_note" text NOT NULL, "status" "public"."recruitment_requests_status_enum" NOT NULL DEFAULT 'PENDING_HR', "requester_id" uuid NOT NULL, "department_id" uuid NOT NULL, "rejection_reason" text, CONSTRAINT "UQ_72b76fc685ce4d5a0abf5ca5379" UNIQUE ("request_code"), CONSTRAINT "PK_ba78c3b2ba80daa76f150b8249a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."job_posts_creation_method_enum" AS ENUM('MANUAL', 'FROM_TEMPLATE', 'AI_SUGGESTION')`);
        await queryRunner.query(`CREATE TYPE "public"."job_posts_status_enum" AS ENUM('DRAFT', 'PENDING_HEAD_APPROVAL', 'PUBLISHED', 'CLOSED', 'ARCHIVED')`);
        await queryRunner.query(`CREATE TYPE "public"."job_posts_level_enum" AS ENUM('INTERN', 'FRESHER', 'JUNIOR', 'MIDDLE', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR')`);
        await queryRunner.query(`CREATE TYPE "public"."job_posts_job_type_enum" AS ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'SEASONAL')`);
        await queryRunner.query(`CREATE TYPE "public"."job_posts_working_model_enum" AS ENUM('ON_SITE', 'HYBRID', 'REMOTE')`);
        await queryRunner.query(`CREATE TYPE "public"."job_posts_min_education_enum" AS ENUM('HIGH_SCHOOL', 'VOCATIONAL', 'COLLEGE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'NOT_REQUIRED')`);
        await queryRunner.query(`CREATE TYPE "public"."job_posts_gender_enum" AS ENUM('ANY', 'MALE', 'FEMALE')`);
        await queryRunner.query(`CREATE TYPE "public"."job_posts_target_platforms_enum" AS ENUM('COMPANY_WEBSITE', 'LINKEDIN', 'TOPCV', 'VIETNAMWORKS', 'CAREERVIET', 'FACEBOOK', 'ZALO', 'REFERRAL', 'MANUAL_ENTRY')`);
        await queryRunner.query(`CREATE TABLE "job_posts" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "job_code" character varying(32) NOT NULL, "is_template" boolean NOT NULL DEFAULT false, "creation_method" "public"."job_posts_creation_method_enum" NOT NULL DEFAULT 'MANUAL', "status" "public"."job_posts_status_enum" NOT NULL DEFAULT 'DRAFT', "public_title" character varying(255) NOT NULL, "specialization" character varying(150) NOT NULL, "domain_knowledge" character varying(150) NOT NULL, "level" "public"."job_posts_level_enum" NOT NULL, "job_type" "public"."job_posts_job_type_enum" NOT NULL DEFAULT 'FULL_TIME', "working_model" "public"."job_posts_working_model_enum" NOT NULL DEFAULT 'ON_SITE', "salary_min" bigint NOT NULL DEFAULT '0', "salary_max" bigint NOT NULL DEFAULT '0', "is_salary_negotiable" boolean NOT NULL DEFAULT true, "job_description" text NOT NULL, "requirements" text NOT NULL, "benefits" text NOT NULL, "extra_benefits" text, "work_locations" jsonb NOT NULL, "working_hours_standard" character varying(255) NOT NULL, "working_hours_detail" text NOT NULL, "min_education" "public"."job_posts_min_education_enum" NOT NULL DEFAULT 'BACHELOR', "experience_years" integer NOT NULL DEFAULT '0', "gender" "public"."job_posts_gender_enum" NOT NULL DEFAULT 'ANY', "age_min" smallint, "age_max" smallint, "must_have_skills" text array NOT NULL DEFAULT '{}', "nice_to_have_skills" text array NOT NULL DEFAULT '{}', "languages" text array NOT NULL DEFAULT '{}', "application_deadline" date NOT NULL, "headcount" integer NOT NULL DEFAULT '1', "hr_recipient_name" character varying(150) NOT NULL, "hr_recipient_phone" character varying(30) NOT NULL, "hr_recipient_email" character varying(150) NOT NULL, "campaign_name" character varying(150), "target_platforms" "public"."job_posts_target_platforms_enum" array NOT NULL DEFAULT '{COMPANY_WEBSITE}', "scheduled_publish_at" TIMESTAMP WITH TIME ZONE, "published_at" TIMESTAMP WITH TIME ZONE, "external_mapping" jsonb NOT NULL DEFAULT '{}', "recruitment_request_id" uuid, CONSTRAINT "UQ_6bf741e8df1759d7400e3f1858c" UNIQUE ("job_code"), CONSTRAINT "REL_f9c465c0bf82d7e8c564025e79" UNIQUE ("recruitment_request_id"), CONSTRAINT "PK_1ecf5b9e46cd2940d254204a73a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_job_posts_status" ON "job_posts"  ("status") `);
        await queryRunner.query(`CREATE TYPE "public"."job_applications_status_enum" AS ENUM('APPLIED', 'AI_SCREENING', 'SHORTLISTED', 'SAVED_POOL', 'SCREENING_REJECTED', 'INTERVIEWING', 'OFFERED', 'HIRED', 'WITHDRAWN')`);
        await queryRunner.query(`CREATE TYPE "public"."job_applications_ai_tier_enum" AS ENUM('HIGH', 'MEDIUM', 'LOW')`);
        await queryRunner.query(`CREATE TABLE "job_applications" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "candidate_id" uuid NOT NULL, "job_post_id" uuid NOT NULL, "status" "public"."job_applications_status_enum" NOT NULL DEFAULT 'APPLIED', "ai_score" smallint, "ai_reasoning" text, "ai_tier" "public"."job_applications_ai_tier_enum", "internal_hr_notes" text, CONSTRAINT "PK_c56a5e86707d0f0df18fa111280" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_job_applications_status" ON "job_applications"  ("job_post_id", "status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_candidate_job_unique" ON "job_applications"  ("candidate_id", "job_post_id") `);
        await queryRunner.query(`CREATE TYPE "public"."application_submissions_platform_source_enum" AS ENUM('COMPANY_WEBSITE', 'LINKEDIN', 'TOPCV', 'VIETNAMWORKS', 'CAREERVIET', 'FACEBOOK', 'ZALO', 'REFERRAL', 'MANUAL_ENTRY')`);
        await queryRunner.query(`CREATE TABLE "application_submissions" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "platform_source" "public"."application_submissions_platform_source_enum" NOT NULL DEFAULT 'COMPANY_WEBSITE', "external_application_id" character varying(100), "cover_letter" text, "cv_url" character varying(500) NOT NULL, "cv_file_key" character varying(255), CONSTRAINT "PK_2a3760c6693df401a760661bf24" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_submission_platform" ON "application_submissions"  ("platform_source", "external_application_id") `);
        await queryRunner.query(`ALTER TYPE "public"."audit_logs_actor_role_level_enum" RENAME TO "audit_logs_actor_role_level_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_actor_role_level_enum" AS ENUM('SUPER_ADMIN', 'SYSTEM_ADMIN', 'EXECUTIVE', 'DIRECTOR', 'HEAD_DEPT', 'STAFF', 'GUEST', 'SYSTEM_SERVICE')`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "actor_role_level" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "actor_role_level" TYPE "public"."audit_logs_actor_role_level_enum" USING "actor_role_level"::"text"::"public"."audit_logs_actor_role_level_enum"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "actor_role_level" SET DEFAULT 'STAFF'`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_actor_role_level_enum_old"`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" ADD CONSTRAINT "FK_b4e2f19f2228dd785976022eeae" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" ADD CONSTRAINT "FK_14863a5ba1efbbe30e4dca79177" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_posts" ADD CONSTRAINT "FK_f9c465c0bf82d7e8c564025e79d" FOREIGN KEY ("recruitment_request_id") REFERENCES "recruitment_requests"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_applications" ADD CONSTRAINT "FK_6ed185c3d4417cc1f5ec3f28e5d" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_applications" ADD CONSTRAINT "FK_9debc71183a3fdc51b65da8a738" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "application_submissions" ADD CONSTRAINT "FK_782e29ec78461ee5496f8e96185" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "application_submissions" DROP CONSTRAINT "FK_782e29ec78461ee5496f8e96185"`);
        await queryRunner.query(`ALTER TABLE "job_applications" DROP CONSTRAINT "FK_9debc71183a3fdc51b65da8a738"`);
        await queryRunner.query(`ALTER TABLE "job_applications" DROP CONSTRAINT "FK_6ed185c3d4417cc1f5ec3f28e5d"`);
        await queryRunner.query(`ALTER TABLE "job_posts" DROP CONSTRAINT "FK_f9c465c0bf82d7e8c564025e79d"`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" DROP CONSTRAINT "FK_14863a5ba1efbbe30e4dca79177"`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" DROP CONSTRAINT "FK_b4e2f19f2228dd785976022eeae"`);
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_actor_role_level_enum_old" AS ENUM('STAFF', 'HEAD_DEPT', 'HEAD_DIR', 'SYSTEM_ADMIN', 'SYSTEM_SERVICE')`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "actor_role_level" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "actor_role_level" TYPE "public"."audit_logs_actor_role_level_enum_old" USING "actor_role_level"::"text"::"public"."audit_logs_actor_role_level_enum_old"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "actor_role_level" SET DEFAULT 'STAFF'`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_actor_role_level_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."audit_logs_actor_role_level_enum_old" RENAME TO "audit_logs_actor_role_level_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_submission_platform"`);
        await queryRunner.query(`DROP TABLE "application_submissions"`);
        await queryRunner.query(`DROP TYPE "public"."application_submissions_platform_source_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidate_job_unique"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_applications_status"`);
        await queryRunner.query(`DROP TABLE "job_applications"`);
        await queryRunner.query(`DROP TYPE "public"."job_applications_ai_tier_enum"`);
        await queryRunner.query(`DROP TYPE "public"."job_applications_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_posts_status"`);
        await queryRunner.query(`DROP TABLE "job_posts"`);
        await queryRunner.query(`DROP TYPE "public"."job_posts_target_platforms_enum"`);
        await queryRunner.query(`DROP TYPE "public"."job_posts_gender_enum"`);
        await queryRunner.query(`DROP TYPE "public"."job_posts_min_education_enum"`);
        await queryRunner.query(`DROP TYPE "public"."job_posts_working_model_enum"`);
        await queryRunner.query(`DROP TYPE "public"."job_posts_job_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."job_posts_level_enum"`);
        await queryRunner.query(`DROP TYPE "public"."job_posts_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."job_posts_creation_method_enum"`);
        await queryRunner.query(`DROP TABLE "recruitment_requests"`);
        await queryRunner.query(`DROP TYPE "public"."recruitment_requests_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidates_email"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidates_phone"`);
        await queryRunner.query(`DROP TABLE "candidate_profiles"`);
    }

}
