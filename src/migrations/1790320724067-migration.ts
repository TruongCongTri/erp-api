import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1790320724067 implements MigrationInterface {
    name = 'Migration1790320724067'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recruitment_requests" DROP CONSTRAINT "FK_14863a5ba1efbbe30e4dca79177"`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" DROP CONSTRAINT "FK_b4e2f19f2228dd785976022eeae"`);
        await queryRunner.query(`ALTER TABLE "job_applications" DROP CONSTRAINT "FK_9debc71183a3fdc51b65da8a738"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidates_email"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_posts_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_applications_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_submission_platform"`);
        await queryRunner.query(`ALTER TABLE "job_applications" ADD "desired_job_title" character varying(150)`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidate_job_unique"`);
        await queryRunner.query(`ALTER TABLE "job_applications" ALTER COLUMN "job_post_id" DROP NOT NULL`);
        await queryRunner.query(`CREATE INDEX "idx_candidates_name_created" ON "candidate_profiles"  ("full_name", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_candidates_created_at" ON "candidate_profiles"  ("created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_candidates_email_unique" ON "candidate_profiles"  ("email") `);
        await queryRunner.query(`CREATE INDEX "idx_system_resources_name" ON "system_resources"  ("name") `);
        await queryRunner.query(`CREATE INDEX "idx_rec_req_requester_id" ON "recruitment_requests"  ("requester_id") `);
        await queryRunner.query(`CREATE INDEX "idx_rec_req_department_id" ON "recruitment_requests"  ("department_id") `);
        await queryRunner.query(`CREATE INDEX "idx_rec_req_created_at" ON "recruitment_requests"  ("created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_rec_req_requester_created" ON "recruitment_requests"  ("requester_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_rec_req_dept_status" ON "recruitment_requests"  ("department_id", "status") `);
        await queryRunner.query(`CREATE INDEX "idx_rec_req_dept_created" ON "recruitment_requests"  ("department_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_rec_req_status_created" ON "recruitment_requests"  ("status", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_job_posts_recruitment_request_id" ON "job_posts"  ("recruitment_request_id") `);
        await queryRunner.query(`CREATE INDEX "idx_job_posts_is_template" ON "job_posts"  ("is_template") `);
        await queryRunner.query(`CREATE INDEX "idx_job_posts_deadline_lookup" ON "job_posts"  ("status", "application_deadline") `);
        await queryRunner.query(`CREATE INDEX "idx_job_posts_filter_lookup" ON "job_posts"  ("status", "specialization", "working_model") `);
        await queryRunner.query(`CREATE INDEX "idx_job_posts_scheduled_worker" ON "job_posts"  ("status", "scheduled_publish_at") `);
        await queryRunner.query(`CREATE INDEX "idx_job_posts_status_created" ON "job_posts"  ("status", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_job_posts_status_published" ON "job_posts"  ("status", "published_at") `);
        await queryRunner.query(`CREATE INDEX "idx_job_app_candidate_id" ON "job_applications"  ("candidate_id") `);
        await queryRunner.query(`CREATE INDEX "idx_job_app_job_post_id" ON "job_applications"  ("job_post_id") `);
        await queryRunner.query(`CREATE INDEX "idx_job_app_candidate_lookup" ON "job_applications"  ("candidate_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_job_app_spontaneous" ON "job_applications"  ("candidate_id", "status") WHERE job_post_id IS NULL AND deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX "idx_job_app_pipeline_ranking" ON "job_applications"  ("job_post_id", "status", "ai_score") `);
        await queryRunner.query(`CREATE INDEX "idx_job_app_pipeline_list" ON "job_applications"  ("job_post_id", "status", "created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_candidate_job_unique" ON "job_applications"  ("candidate_id", "job_post_id") WHERE deleted_at IS NULL AND job_post_id IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "idx_submission_app_created" ON "application_submissions"  ("application_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_submission_platform_audit" ON "application_submissions"  ("platform_source", "external_application_id") `);
        await queryRunner.query(`CREATE INDEX "idx_submission_purge_cron" ON "application_submissions"  ("is_cv_purged", "cv_purge_at") `);
        await queryRunner.query(`CREATE INDEX "idx_submissions_application_id" ON "application_submissions"  ("application_id") `);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" ADD CONSTRAINT "FK_b4e2f19f2228dd785976022eeae" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" ADD CONSTRAINT "FK_14863a5ba1efbbe30e4dca79177" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_applications" ADD CONSTRAINT "FK_9debc71183a3fdc51b65da8a738" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_applications" DROP CONSTRAINT "FK_9debc71183a3fdc51b65da8a738"`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" DROP CONSTRAINT "FK_14863a5ba1efbbe30e4dca79177"`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" DROP CONSTRAINT "FK_b4e2f19f2228dd785976022eeae"`);
        await queryRunner.query(`DROP INDEX "public"."idx_submissions_application_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_submission_purge_cron"`);
        await queryRunner.query(`DROP INDEX "public"."idx_submission_platform_audit"`);
        await queryRunner.query(`DROP INDEX "public"."idx_submission_app_created"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidate_job_unique"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_app_pipeline_list"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_app_pipeline_ranking"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_app_spontaneous"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_app_candidate_lookup"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_app_job_post_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_app_candidate_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_posts_status_published"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_posts_status_created"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_posts_scheduled_worker"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_posts_filter_lookup"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_posts_deadline_lookup"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_posts_is_template"`);
        await queryRunner.query(`DROP INDEX "public"."idx_job_posts_recruitment_request_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_rec_req_status_created"`);
        await queryRunner.query(`DROP INDEX "public"."idx_rec_req_dept_created"`);
        await queryRunner.query(`DROP INDEX "public"."idx_rec_req_dept_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_rec_req_requester_created"`);
        await queryRunner.query(`DROP INDEX "public"."idx_rec_req_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_rec_req_department_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_rec_req_requester_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_system_resources_name"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidates_email_unique"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidates_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidates_name_created"`);
        await queryRunner.query(`ALTER TABLE "job_applications" ALTER COLUMN "job_post_id" SET NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_candidate_job_unique" ON "job_applications" USING btree ("candidate_id", "job_post_id") `);
        await queryRunner.query(`ALTER TABLE "job_applications" DROP COLUMN "desired_job_title"`);
        await queryRunner.query(`CREATE INDEX "idx_submission_platform" ON "application_submissions" USING btree ("external_application_id", "platform_source") `);
        await queryRunner.query(`CREATE INDEX "idx_job_applications_status" ON "job_applications" USING btree ("job_post_id", "status") `);
        await queryRunner.query(`CREATE INDEX "idx_job_posts_status" ON "job_posts" USING btree ("status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_candidates_email" ON "candidate_profiles" USING btree ("email") `);
        await queryRunner.query(`ALTER TABLE "job_applications" ADD CONSTRAINT "FK_9debc71183a3fdc51b65da8a738" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" ADD CONSTRAINT "FK_b4e2f19f2228dd785976022eeae" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recruitment_requests" ADD CONSTRAINT "FK_14863a5ba1efbbe30e4dca79177" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
