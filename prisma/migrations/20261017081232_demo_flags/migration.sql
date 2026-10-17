-- AlterTable
ALTER TABLE "Experiment" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Mistake" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;
