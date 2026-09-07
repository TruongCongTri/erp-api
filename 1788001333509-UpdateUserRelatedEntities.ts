import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateUserRelatedEntities1788001333509 implements MigrationInterface {
    name = 'UpdateUserRelatedEntities1788001333509'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "roles" DROP CONSTRAINT "FK_42353a3d71b2924e2b384901d7f"`);
        await queryRunner.query(`CREATE TABLE "user_avatars" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "image_url" character varying NOT NULL, "is_current" boolean NOT NULL DEFAULT false, "user_id" uuid, CONSTRAINT "PK_1db3af883d6418118ebe7448799" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "updated_by_id"`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD "created_by" uuid`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD "created_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD "updated_by" uuid`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD "updated_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD "deleted_by" uuid`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD "deleted_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "roles" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "roles" ADD "created_by" uuid`);
        await queryRunner.query(`ALTER TABLE "roles" ADD "created_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "roles" ADD "updated_by" uuid`);
        await queryRunner.query(`ALTER TABLE "roles" ADD "updated_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "roles" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "roles" ADD "deleted_by" uuid`);
        await queryRunner.query(`ALTER TABLE "roles" ADD "deleted_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" ADD "created_by" uuid`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" ADD "created_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" ADD "updated_by" uuid`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" ADD "updated_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" ADD "deleted_by" uuid`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" ADD "deleted_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "created_by" uuid`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "created_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "updated_by" uuid`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "updated_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "deleted_by" uuid`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "deleted_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "created_by" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "created_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "updated_by" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "updated_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_by" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_by_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "user_avatars" ADD CONSTRAINT "FK_2681c26ee00a969a6143ab8d38c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_avatars" DROP CONSTRAINT "FK_2681c26ee00a969a6143ab8d38c"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_by_name"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_by"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updated_by_name"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updated_by"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "created_by_name"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "created_by"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "deleted_by_name"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "deleted_by"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "updated_by_name"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "updated_by"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "created_by_name"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "created_by"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" DROP COLUMN "deleted_by_name"`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" DROP COLUMN "deleted_by"`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" DROP COLUMN "updated_by_name"`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" DROP COLUMN "updated_by"`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" DROP COLUMN "created_by_name"`);
        await queryRunner.query(`ALTER TABLE "citizen_identity_cards" DROP COLUMN "created_by"`);
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "deleted_by_name"`);
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "deleted_by"`);
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "updated_by_name"`);
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "updated_by"`);
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "created_by_name"`);
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "created_by"`);
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "deleted_by_name"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "deleted_by"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "updated_by_name"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "updated_by"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "created_by_name"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "created_by"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "roles" ADD "updated_by_id" uuid`);
        await queryRunner.query(`DROP TABLE "user_avatars"`);
        await queryRunner.query(`ALTER TABLE "roles" ADD CONSTRAINT "FK_42353a3d71b2924e2b384901d7f" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
