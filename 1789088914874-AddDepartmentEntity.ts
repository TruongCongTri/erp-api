import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDepartmentEntity1789088914874 implements MigrationInterface {
    name = 'AddDepartmentEntity1789088914874'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "departments" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(64) NOT NULL, "code" character varying(32) NOT NULL, "name" character varying(150) NOT NULL, "organization_id" uuid, "head_user_id" uuid, "parent_id" uuid, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_91fddbe23e927e1e525c152baa3" UNIQUE ("code"), CONSTRAINT "PK_839517a681a86bb84cbcc6a1e9d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a23b1fdc69006219d8acc76c04" ON "departments"  ("slug") `);
        await queryRunner.query(`CREATE TYPE "public"."tickets_category_enum" AS ENUM('COORDINATION', 'CONFLICT', 'HANDOFF', 'SERVICE_REQUEST', 'ESCALATION')`);
        await queryRunner.query(`CREATE TYPE "public"."tickets_priority_enum" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT', 'BLOCKER')`);
        await queryRunner.query(`CREATE TYPE "public"."tickets_status_enum" AS ENUM('DRAFT', 'SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_INFO', 'MEETING_SCHEDULED', 'RESOLVED', 'REJECTED', 'CLOSED', 'REOPENED')`);
        await queryRunner.query(`CREATE TABLE "tickets" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticket_code" character varying(32) NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL, "category" "public"."tickets_category_enum" NOT NULL, "priority" "public"."tickets_priority_enum" NOT NULL DEFAULT 'NORMAL', "status" "public"."tickets_status_enum" NOT NULL DEFAULT 'SUBMITTED', "requester_id" uuid NOT NULL, "requester_department_id" character varying(64) NOT NULL, "target_department_id" character varying(64) NOT NULL, "assignee_id" uuid, "target_entity_type" character varying(64), "target_entity_id" character varying(64), "target_project_id" character varying(64), "response_due_at" TIMESTAMP WITH TIME ZONE, "resolution_due_at" TIMESTAMP WITH TIME ZONE, "is_sla_breached" boolean NOT NULL DEFAULT false, "resolution_note" text, "rejection_reason" text, CONSTRAINT "UQ_40e7b62bf74bc61a7d74d682936" UNIQUE ("ticket_code"), CONSTRAINT "PK_343bc942ae261cf7a1377f48fd0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_ticket_assignee" ON "tickets"  ("assignee_id", "status") `);
        await queryRunner.query(`CREATE INDEX "idx_ticket_requester" ON "tickets"  ("requester_id", "status") `);
        await queryRunner.query(`CREATE INDEX "idx_ticket_queue" ON "tickets"  ("target_department_id", "status", "priority") `);
        await queryRunner.query(`CREATE TABLE "ticket_meetings" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticket_id" uuid NOT NULL, "meeting_id" uuid, "agenda" character varying(255) NOT NULL, "scheduled_start" TIMESTAMP WITH TIME ZONE NOT NULL, "scheduled_end" TIMESTAMP WITH TIME ZONE NOT NULL, "meeting_url" character varying(500), "action_items" jsonb, "outcomes_summary" text, CONSTRAINT "PK_094adab833314a3517b3ef2841a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_ticket_meeting_ticket" ON "ticket_meetings"  ("ticket_id") `);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "designated_department_id" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "organization_id" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "department_id" uuid`);
        await queryRunner.query(`ALTER TABLE "departments" ADD CONSTRAINT "FK_ad56c1268186fb36cb745443f07" FOREIGN KEY ("head_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "departments" ADD CONSTRAINT "FK_700b0b13f494cb37b6ca929e79b" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD CONSTRAINT "FK_ad1097d8cf3e0c8b241f0946270" FOREIGN KEY ("designated_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_0921d1972cf861d568f5271cd85" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticket_meetings" ADD CONSTRAINT "FK_ce5ec49094dad3222dc9ccc6931" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ticket_meetings" DROP CONSTRAINT "FK_ce5ec49094dad3222dc9ccc6931"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_0921d1972cf861d568f5271cd85"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP CONSTRAINT "FK_ad1097d8cf3e0c8b241f0946270"`);
        await queryRunner.query(`ALTER TABLE "departments" DROP CONSTRAINT "FK_700b0b13f494cb37b6ca929e79b"`);
        await queryRunner.query(`ALTER TABLE "departments" DROP CONSTRAINT "FK_ad56c1268186fb36cb745443f07"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "department_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organization_id"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "designated_department_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_ticket_meeting_ticket"`);
        await queryRunner.query(`DROP TABLE "ticket_meetings"`);
        await queryRunner.query(`DROP INDEX "public"."idx_ticket_queue"`);
        await queryRunner.query(`DROP INDEX "public"."idx_ticket_requester"`);
        await queryRunner.query(`DROP INDEX "public"."idx_ticket_assignee"`);
        await queryRunner.query(`DROP TABLE "tickets"`);
        await queryRunner.query(`DROP TYPE "public"."tickets_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tickets_priority_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tickets_category_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a23b1fdc69006219d8acc76c04"`);
        await queryRunner.query(`DROP TABLE "departments"`);
    }

}
