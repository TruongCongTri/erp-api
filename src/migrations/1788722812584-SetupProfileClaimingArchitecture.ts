import { MigrationInterface, QueryRunner } from "typeorm";

export class SetupProfileClaimingArchitecture1788722812584 implements MigrationInterface {
    name = 'SetupProfileClaimingArchitecture1788722812584'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "employee_designated_permissions" ("employeeProfilesId" uuid NOT NULL, "permissionsId" uuid NOT NULL, CONSTRAINT "PK_727e5c963dd3682b7dae50a6b02" PRIMARY KEY ("employeeProfilesId", "permissionsId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_41d7f9d434280fbb86f382a4e9" ON "employee_designated_permissions"  ("employeeProfilesId") `);
        await queryRunner.query(`CREATE INDEX "IDX_6fd7732591d7325bf5afcf2ce9" ON "employee_designated_permissions"  ("permissionsId") `);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "department" character varying`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD "designated_role_id" uuid`);
        await queryRunner.query(`ALTER TYPE "public"."users_status_enum" ADD VALUE 'PENDING_APPROVAL'`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD CONSTRAINT "FK_1d0744c99c981bf50aa06426c93" FOREIGN KEY ("designated_role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_designated_permissions" ADD CONSTRAINT "FK_41d7f9d434280fbb86f382a4e95" FOREIGN KEY ("employeeProfilesId") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "employee_designated_permissions" ADD CONSTRAINT "FK_6fd7732591d7325bf5afcf2ce9d" FOREIGN KEY ("permissionsId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee_designated_permissions" DROP CONSTRAINT "FK_6fd7732591d7325bf5afcf2ce9d"`);
        await queryRunner.query(`ALTER TABLE "employee_designated_permissions" DROP CONSTRAINT "FK_41d7f9d434280fbb86f382a4e95"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP CONSTRAINT "FK_1d0744c99c981bf50aa06426c93"`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum_old" AS ENUM('PENDING_VERIFICATION', 'ACTIVE', 'ON_LEAVE', 'RESIGNED')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" TYPE "public"."users_status_enum_old" USING "status"::"text"::"public"."users_status_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_status_enum_old" RENAME TO "users_status_enum"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "designated_role_id"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP COLUMN "department"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6fd7732591d7325bf5afcf2ce9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_41d7f9d434280fbb86f382a4e9"`);
        await queryRunner.query(`DROP TABLE "employee_designated_permissions"`);
    }

}
