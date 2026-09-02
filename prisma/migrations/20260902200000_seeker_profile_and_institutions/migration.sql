-- AlterTable
ALTER TABLE `person` ADD COLUMN `education` VARCHAR(200) NULL,
    ADD COLUMN `account_type` VARCHAR(20) NOT NULL DEFAULT 'seeker';
