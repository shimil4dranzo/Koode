-- AlterTable
ALTER TABLE `person` ADD COLUMN `email` VARCHAR(255) NULL,
    ADD COLUMN `google_sub` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `person_google_sub_key` ON `person`(`google_sub`);
