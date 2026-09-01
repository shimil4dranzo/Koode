-- Runs once, on first container start, before the app ever connects.
--
-- MYSQL_DATABASE in docker-compose.yml creates `Koode` using the server
-- defaults, which we have already pinned to utf8mb4 / utf8mb4_0900_ai_ci.
-- This statement is belt-and-braces: it makes the requirement explicit and
-- survives someone changing the compose command flags without reading them.
CREATE DATABASE IF NOT EXISTS `Koode`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

ALTER DATABASE `Koode`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
