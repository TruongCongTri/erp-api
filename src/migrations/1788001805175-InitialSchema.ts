import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1788001805175 implements MigrationInterface {
  name = 'InitialSchema1788001805175';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "system_resources" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(100) NOT NULL, "name" character varying(255) NOT NULL, "description" text, "is_live" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_39d7b159d849d5920f73a15f7d3" UNIQUE ("slug"), CONSTRAINT "PK_6d8ad7cefe7e622b8059c720d8f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."permissions_action_enum" AS ENUM('create', 'read', 'update', 'delete', 'manage', 'approve', 'audit', 'process', '*')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."permissions_scope_enum" AS ENUM('any', 'dept', 'own')`,
    );
    await queryRunner.query(
      `CREATE TABLE "permissions" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying NOT NULL, "name" character varying NOT NULL, "description" character varying, "action" "public"."permissions_action_enum" NOT NULL, "scope" "public"."permissions_scope_enum" NOT NULL, "isDefault" boolean NOT NULL DEFAULT false, "is_live" boolean NOT NULL DEFAULT false, "resource_id" uuid, CONSTRAINT "UQ_d090ad82a0e97ce764c06c7b312" UNIQUE ("slug"), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying NOT NULL, "name" character varying NOT NULL, "isDefault" boolean NOT NULL DEFAULT false, "is_live" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_881f72bac969d9a00a1a29e1079" UNIQUE ("slug"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."citizen_identity_cards_gender_enum" AS ENUM('Nam', 'Nữ')`,
    );
    await queryRunner.query(
      `CREATE TABLE "citizen_identity_cards" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cccd_number" character varying(12) NOT NULL, "full_name" character varying(255) NOT NULL, "date_of_birth" date NOT NULL, "gender" "public"."citizen_identity_cards_gender_enum" NOT NULL, "nationality" character varying(100) NOT NULL DEFAULT 'Việt Nam', "ethnicity" character varying(100), "religion" character varying(100), "place_of_origin" character varying(500) NOT NULL, "place_of_residence" character varying(500) NOT NULL, "temporary_address" character varying(500), "personal_identification" text, "date_of_issue" date NOT NULL, "date_of_expiry" date NOT NULL, "place_of_issue" character varying(255) NOT NULL, "raw_qr_data" jsonb, CONSTRAINT "UQ_94ee116226d91e0063745278ede" UNIQUE ("cccd_number"), CONSTRAINT "PK_5cbf13ae8effaba614aa9f737de" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_94ee116226d91e0063745278ed" ON "citizen_identity_cards"  ("cccd_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "employee_profiles" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "employee_code" character varying NOT NULL, "date_of_birth" date NOT NULL, "gender" character varying(10) NOT NULL, "tax_code" character varying, "social_insurance_number" character varying, "phone_number" character varying(15) NOT NULL, "permanent_address" text NOT NULL, "temporary_address" text, "join_date" date NOT NULL, "job_title" character varying NOT NULL, "identity_card_id" uuid, "user_id" uuid, CONSTRAINT "UQ_1b72411d5c42f4d6b2ecd0a1f89" UNIQUE ("employee_code"), CONSTRAINT "REL_62d300fe8ce57ecbdbe2c08ff0" UNIQUE ("identity_card_id"), CONSTRAINT "REL_986e309c16f09ce6cc47d674cf" UNIQUE ("user_id"), CONSTRAINT "PK_8481c6a4516f6589b23adf7fefa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_avatars" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "image_url" character varying NOT NULL, "is_current" boolean NOT NULL DEFAULT false, "user_id" uuid, CONSTRAINT "PK_1db3af883d6418118ebe7448799" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('PENDING_VERIFICATION', 'ACTIVE', 'ON_LEAVE', 'RESIGNED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "created_by_name" character varying(255), "updated_by" uuid, "updated_by_name" character varying(255), "deleted_at" TIMESTAMP, "deleted_by" uuid, "deleted_by_name" character varying(255), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "full_name" character varying NOT NULL, "avatar_url" character varying, "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', "role_id" uuid, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "message" character varying NOT NULL, "actionUrl" character varying, "isRead" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("rolesId" uuid NOT NULL, "permissionsId" uuid NOT NULL, CONSTRAINT "PK_7931614007a93423204b4b73240" PRIMARY KEY ("rolesId", "permissionsId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0cb93c5877d37e954e2aa59e52" ON "role_permissions"  ("rolesId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d422dabc78ff74a8dab6583da0" ON "role_permissions"  ("permissionsId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_bonus_permissions" ("usersId" uuid NOT NULL, "permissionsId" uuid NOT NULL, CONSTRAINT "PK_161339aa7c21fc75103a8103364" PRIMARY KEY ("usersId", "permissionsId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_11bc4c3358b9d5684be3848a5b" ON "user_bonus_permissions"  ("usersId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b3910122810180c1645598e453" ON "user_bonus_permissions"  ("permissionsId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "permissions" ADD CONSTRAINT "FK_a5b7bf2f14f8df49fc610e9a8be" FOREIGN KEY ("resource_id") REFERENCES "system_resources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_profiles" ADD CONSTRAINT "FK_62d300fe8ce57ecbdbe2c08ff00" FOREIGN KEY ("identity_card_id") REFERENCES "citizen_identity_cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_profiles" ADD CONSTRAINT "FK_986e309c16f09ce6cc47d674cfe" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_avatars" ADD CONSTRAINT "FK_2681c26ee00a969a6143ab8d38c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_692a909ee0fa9383e7859f9b406" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_0cb93c5877d37e954e2aa59e52c" FOREIGN KEY ("rolesId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_d422dabc78ff74a8dab6583da02" FOREIGN KEY ("permissionsId") REFERENCES "permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_bonus_permissions" ADD CONSTRAINT "FK_11bc4c3358b9d5684be3848a5b3" FOREIGN KEY ("usersId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_bonus_permissions" ADD CONSTRAINT "FK_b3910122810180c1645598e4531" FOREIGN KEY ("permissionsId") REFERENCES "permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_bonus_permissions" DROP CONSTRAINT "FK_b3910122810180c1645598e4531"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_bonus_permissions" DROP CONSTRAINT "FK_11bc4c3358b9d5684be3848a5b3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_d422dabc78ff74a8dab6583da02"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_0cb93c5877d37e954e2aa59e52c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_692a909ee0fa9383e7859f9b406"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_avatars" DROP CONSTRAINT "FK_2681c26ee00a969a6143ab8d38c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_profiles" DROP CONSTRAINT "FK_986e309c16f09ce6cc47d674cfe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_profiles" DROP CONSTRAINT "FK_62d300fe8ce57ecbdbe2c08ff00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "permissions" DROP CONSTRAINT "FK_a5b7bf2f14f8df49fc610e9a8be"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b3910122810180c1645598e453"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_11bc4c3358b9d5684be3848a5b"`,
    );
    await queryRunner.query(`DROP TABLE "user_bonus_permissions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d422dabc78ff74a8dab6583da0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0cb93c5877d37e954e2aa59e52"`,
    );
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TABLE "user_avatars"`);
    await queryRunner.query(`DROP TABLE "employee_profiles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_94ee116226d91e0063745278ed"`,
    );
    await queryRunner.query(`DROP TABLE "citizen_identity_cards"`);
    await queryRunner.query(
      `DROP TYPE "public"."citizen_identity_cards_gender_enum"`,
    );
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(`DROP TYPE "public"."permissions_scope_enum"`);
    await queryRunner.query(`DROP TYPE "public"."permissions_action_enum"`);
    await queryRunner.query(`DROP TABLE "system_resources"`);
  }
}
