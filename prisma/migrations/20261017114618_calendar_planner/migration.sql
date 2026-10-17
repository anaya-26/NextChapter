-- AlterTable
ALTER TABLE "CalendarConnection" ADD COLUMN     "syncKinds" "EventKind"[] DEFAULT ARRAY['REVISION', 'STUDY', 'EXAM', 'ASSIGNMENT']::"EventKind"[];

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "syncOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN     "targetEventId" TEXT;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_targetEventId_fkey" FOREIGN KEY ("targetEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
