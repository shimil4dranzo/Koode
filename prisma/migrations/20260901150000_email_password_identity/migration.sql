-- AlterTable
ALTER TABLE `person` ADD COLUMN `password_hash` VARCHAR(255) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `person_email_key` ON `person`(`email`);
