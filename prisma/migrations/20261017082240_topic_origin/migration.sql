-- CreateEnum
CREATE TYPE "TopicOrigin" AS ENUM ('SYLLABUS', 'AI', 'MOCK', 'STUDENT');

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "objectivesSource" TEXT,
ADD COLUMN     "origin" "TopicOrigin" NOT NULL DEFAULT 'SYLLABUS',
ADD COLUMN     "prerequisitesSource" TEXT;
