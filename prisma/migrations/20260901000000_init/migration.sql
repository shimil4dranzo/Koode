-- CreateTable
CREATE TABLE `locality` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `level` VARCHAR(20) NOT NULL,
    `name_en` VARCHAR(120) NOT NULL,
    `name_ml` VARCHAR(120) NULL,
    `parent_id` BIGINT NULL,
    `path` VARCHAR(255) NOT NULL,
    `depth` SMALLINT NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `locality_public_id_key`(`public_id`),
    INDEX `locality_parent_id_idx`(`parent_id`),
    INDEX `locality_level_idx`(`level`),
    INDEX `locality_path_idx`(`path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `locality_adjacency` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `locality_id` BIGINT NOT NULL,
    `neighbour_id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `locality_adjacency_neighbour_id_idx`(`neighbour_id`),
    UNIQUE INDEX `locality_adjacency_locality_id_neighbour_id_key`(`locality_id`, `neighbour_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `category` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `level` VARCHAR(20) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `name_en` VARCHAR(120) NOT NULL,
    `name_ml` VARCHAR(120) NULL,
    `parent_id` BIGINT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `category_public_id_key`(`public_id`),
    UNIQUE INDEX `category_slug_key`(`slug`),
    INDEX `category_parent_id_idx`(`parent_id`),
    INDEX `category_level_idx`(`level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `person` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `display_name` VARCHAR(120) NOT NULL,
    `locality_id` BIGINT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending_claim',
    `platform_role` VARCHAR(20) NOT NULL DEFAULT 'none',
    `created_by_person_id` BIGINT NULL,
    `claimed_at` DATETIME(3) NULL,
    `suspended_at` DATETIME(3) NULL,
    `anonymized_at` DATETIME(3) NULL,
    `headline` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `person_public_id_key`(`public_id`),
    UNIQUE INDEX `person_phone_key`(`phone`),
    INDEX `person_locality_id_idx`(`locality_id`),
    INDEX `person_status_idx`(`status`),
    INDEX `person_created_by_person_id_idx`(`created_by_person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `person_skill` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `person_id` BIGINT NOT NULL,
    `category_id` BIGINT NOT NULL,
    `years_experience` SMALLINT NULL,
    `qualification_note` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `person_skill_category_id_idx`(`category_id`),
    UNIQUE INDEX `person_skill_person_id_category_id_key`(`person_id`, `category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `consent_record` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `person_id` BIGINT NOT NULL,
    `consent_version` VARCHAR(20) NOT NULL,
    `purpose` VARCHAR(40) NOT NULL,
    `locale` VARCHAR(8) NOT NULL,
    `accepted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip_hash` VARCHAR(64) NULL,

    INDEX `consent_record_person_id_purpose_idx`(`person_id`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `person_id` BIGINT NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `user_agent` VARCHAR(255) NULL,
    `ip_hash` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `session_token_hash_key`(`token_hash`),
    INDEX `session_person_id_idx`(`person_id`),
    INDEX `session_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `otp_challenge` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `phone` VARCHAR(20) NOT NULL,
    `code_hash` VARCHAR(64) NOT NULL,
    `purpose` VARCHAR(20) NOT NULL,
    `attempts` SMALLINT NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `otp_challenge_phone_purpose_idx`(`phone`, `purpose`),
    INDEX `otp_challenge_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `anchor_org` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `name_en` VARCHAR(160) NOT NULL,
    `name_ml` VARCHAR(160) NULL,
    `type` VARCHAR(30) NOT NULL,
    `locality_id` BIGINT NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `anchor_org_public_id_key`(`public_id`),
    INDEX `anchor_org_locality_id_idx`(`locality_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `anchor_membership` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `person_id` BIGINT NOT NULL,
    `anchor_org_id` BIGINT NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'member',
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `membership_ref` VARCHAR(60) NULL,
    `verified_by_person_id` BIGINT NULL,
    `verified_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `anchor_membership_anchor_org_id_status_idx`(`anchor_org_id`, `status`),
    UNIQUE INDEX `anchor_membership_person_id_anchor_org_id_key`(`person_id`, `anchor_org_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `requirement` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `posted_by_person_id` BIGINT NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `category_id` BIGINT NOT NULL,
    `locality_id` BIGINT NOT NULL,
    `engagement_type` VARCHAR(20) NOT NULL,
    `pay_min` DECIMAL(12, 2) NULL,
    `pay_max` DECIMAL(12, 2) NULL,
    `pay_period` VARCHAR(20) NULL,
    `contact_preference` VARCHAR(20) NOT NULL DEFAULT 'call',
    `vacancies` SMALLINT NOT NULL DEFAULT 1,
    `status` VARCHAR(20) NOT NULL DEFAULT 'open',
    `expires_at` DATETIME(3) NOT NULL,
    `filled_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `hidden_at` DATETIME(3) NULL,
    `hidden_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `requirement_public_id_key`(`public_id`),
    INDEX `requirement_status_locality_id_created_at_idx`(`status`, `locality_id`, `created_at`),
    INDEX `requirement_status_category_id_created_at_idx`(`status`, `category_id`, `created_at`),
    INDEX `requirement_posted_by_person_id_idx`(`posted_by_person_id`),
    INDEX `requirement_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `recommendation` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `referrer_person_id` BIGINT NOT NULL,
    `subject_person_id` BIGINT NOT NULL,
    `note` TEXT NOT NULL,
    `relationship_context` VARCHAR(40) NOT NULL,
    `category_id` BIGINT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `active_subject_key` BIGINT NULL,
    `withdrawn_at` DATETIME(3) NULL,
    `withdrawn_reason` VARCHAR(255) NULL,
    `hidden_at` DATETIME(3) NULL,
    `hidden_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `recommendation_public_id_key`(`public_id`),
    INDEX `recommendation_subject_person_id_status_idx`(`subject_person_id`, `status`),
    INDEX `recommendation_referrer_person_id_status_idx`(`referrer_person_id`, `status`),
    UNIQUE INDEX `uq_recommendation_active_pair`(`referrer_person_id`, `active_subject_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `recommendation_block` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `subject_person_id` BIGINT NOT NULL,
    `referrer_person_id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `recommendation_block_referrer_person_id_idx`(`referrer_person_id`),
    UNIQUE INDEX `recommendation_block_subject_person_id_referrer_person_id_key`(`subject_person_id`, `referrer_person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `claim_invitation` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `person_id` BIGINT NOT NULL,
    `recommendation_id` BIGINT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `expires_at` DATETIME(3) NOT NULL,
    `claimed_at` DATETIME(3) NULL,
    `rejected_at` DATETIME(3) NULL,
    `sent_count` SMALLINT NOT NULL DEFAULT 0,
    `last_sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `claim_invitation_public_id_key`(`public_id`),
    UNIQUE INDEX `claim_invitation_token_hash_key`(`token_hash`),
    INDEX `claim_invitation_person_id_status_idx`(`person_id`, `status`),
    INDEX `claim_invitation_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `interest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `requirement_id` BIGINT NOT NULL,
    `person_id` BIGINT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'expressed',
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `interest_public_id_key`(`public_id`),
    INDEX `interest_person_id_status_idx`(`person_id`, `status`),
    UNIQUE INDEX `interest_requirement_id_person_id_key`(`requirement_id`, `person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `engagement` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `requirement_id` BIGINT NOT NULL,
    `person_id` BIGINT NOT NULL,
    `outcome` VARCHAR(30) NOT NULL,
    `note` VARCHAR(500) NULL,
    `recorded_by_person_id` BIGINT NOT NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `engagement_public_id_key`(`public_id`),
    INDEX `engagement_person_id_idx`(`person_id`),
    UNIQUE INDEX `engagement_requirement_id_person_id_key`(`requirement_id`, `person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `audit_event` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actor_person_id` BIGINT NULL,
    `action` VARCHAR(60) NOT NULL,
    `entity_type` VARCHAR(40) NULL,
    `entity_id` VARCHAR(30) NULL,
    `ip_hash` VARCHAR(64) NULL,
    `user_agent` VARCHAR(255) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_event_actor_person_id_created_at_idx`(`actor_person_id`, `created_at`),
    INDEX `audit_event_action_created_at_idx`(`action`, `created_at`),
    INDEX `audit_event_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `moderation_report` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(30) NOT NULL,
    `reporter_person_id` BIGINT NULL,
    `entity_type` VARCHAR(40) NOT NULL,
    `entity_id` VARCHAR(30) NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `detail` VARCHAR(500) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'open',
    `resolved_by_person_id` BIGINT NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolution_note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `moderation_report_public_id_key`(`public_id`),
    INDEX `moderation_report_status_created_at_idx`(`status`, `created_at`),
    INDEX `moderation_report_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `locality` ADD CONSTRAINT `locality_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `locality`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `locality_adjacency` ADD CONSTRAINT `locality_adjacency_locality_id_fkey` FOREIGN KEY (`locality_id`) REFERENCES `locality`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `locality_adjacency` ADD CONSTRAINT `locality_adjacency_neighbour_id_fkey` FOREIGN KEY (`neighbour_id`) REFERENCES `locality`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category` ADD CONSTRAINT `category_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `person` ADD CONSTRAINT `person_locality_id_fkey` FOREIGN KEY (`locality_id`) REFERENCES `locality`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `person` ADD CONSTRAINT `person_created_by_person_id_fkey` FOREIGN KEY (`created_by_person_id`) REFERENCES `person`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `person_skill` ADD CONSTRAINT `person_skill_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `person_skill` ADD CONSTRAINT `person_skill_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_record` ADD CONSTRAINT `consent_record_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `anchor_org` ADD CONSTRAINT `anchor_org_locality_id_fkey` FOREIGN KEY (`locality_id`) REFERENCES `locality`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `anchor_membership` ADD CONSTRAINT `anchor_membership_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `anchor_membership` ADD CONSTRAINT `anchor_membership_anchor_org_id_fkey` FOREIGN KEY (`anchor_org_id`) REFERENCES `anchor_org`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `anchor_membership` ADD CONSTRAINT `anchor_membership_verified_by_person_id_fkey` FOREIGN KEY (`verified_by_person_id`) REFERENCES `person`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requirement` ADD CONSTRAINT `requirement_posted_by_person_id_fkey` FOREIGN KEY (`posted_by_person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requirement` ADD CONSTRAINT `requirement_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requirement` ADD CONSTRAINT `requirement_locality_id_fkey` FOREIGN KEY (`locality_id`) REFERENCES `locality`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation` ADD CONSTRAINT `recommendation_referrer_person_id_fkey` FOREIGN KEY (`referrer_person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation` ADD CONSTRAINT `recommendation_subject_person_id_fkey` FOREIGN KEY (`subject_person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation_block` ADD CONSTRAINT `recommendation_block_subject_person_id_fkey` FOREIGN KEY (`subject_person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation_block` ADD CONSTRAINT `recommendation_block_referrer_person_id_fkey` FOREIGN KEY (`referrer_person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_invitation` ADD CONSTRAINT `claim_invitation_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_invitation` ADD CONSTRAINT `claim_invitation_recommendation_id_fkey` FOREIGN KEY (`recommendation_id`) REFERENCES `recommendation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interest` ADD CONSTRAINT `interest_requirement_id_fkey` FOREIGN KEY (`requirement_id`) REFERENCES `requirement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interest` ADD CONSTRAINT `interest_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `engagement` ADD CONSTRAINT `engagement_requirement_id_fkey` FOREIGN KEY (`requirement_id`) REFERENCES `requirement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `engagement` ADD CONSTRAINT `engagement_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `engagement` ADD CONSTRAINT `engagement_recorded_by_person_id_fkey` FOREIGN KEY (`recorded_by_person_id`) REFERENCES `person`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_event` ADD CONSTRAINT `audit_event_actor_person_id_fkey` FOREIGN KEY (`actor_person_id`) REFERENCES `person`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_report` ADD CONSTRAINT `moderation_report_reporter_person_id_fkey` FOREIGN KEY (`reporter_person_id`) REFERENCES `person`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_report` ADD CONSTRAINT `moderation_report_resolved_by_person_id_fkey` FOREIGN KEY (`resolved_by_person_id`) REFERENCES `person`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
